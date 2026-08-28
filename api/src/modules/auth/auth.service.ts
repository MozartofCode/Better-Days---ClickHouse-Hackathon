import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pgPool } from "../../db/postgres";
import { env } from "../../config/env";
import { AuthUser, UserRole } from "../../types";
import { HttpError } from "../../utils/http-error";

const SALT_ROUNDS = 10;

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  foodBankName: string;
}

interface LoginInput {
  email: string;
  password: string;
}

async function findOrCreateFoodBank(name: string): Promise<{ id: string; name: string }> {
  const existing = await pgPool.query(
    "SELECT id, name FROM food_banks WHERE name = $1",
    [name]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }
  const created = await pgPool.query(
    "INSERT INTO food_banks (name) VALUES ($1) RETURNING id, name",
    [name]
  );
  return created.rows[0];
}

function toAuthUser(row: any, foodBankName: string): AuthUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    foodBankId: row.food_bank_id,
    foodBankName,
  };
}

function signToken(user: AuthUser): string {
  return jwt.sign(user, env.jwtSecret, { expiresIn: "7d" });
}

export async function register(input: RegisterInput): Promise<{ token: string; user: AuthUser }> {
  const existingUser = await pgPool.query("SELECT id FROM users WHERE email = $1", [input.email]);
  if (existingUser.rows.length > 0) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const foodBank = await findOrCreateFoodBank(input.foodBankName);
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const result = await pgPool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, food_bank_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, first_name, last_name, role, food_bank_id`,
    [input.email, passwordHash, input.firstName, input.lastName, input.role, foodBank.id]
  );

  const user = toAuthUser(result.rows[0], foodBank.name);
  return { token: signToken(user), user };
}

export async function login(input: LoginInput): Promise<{ token: string; user: AuthUser }> {
  const result = await pgPool.query(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.role, u.food_bank_id, f.name AS food_bank_name
     FROM users u
     JOIN food_banks f ON f.id = u.food_bank_id
     WHERE u.email = $1`,
    [input.email]
  );

  if (result.rows.length === 0) {
    throw new HttpError(401, "Invalid email or password");
  }

  const row = result.rows[0];
  const passwordMatches = await bcrypt.compare(input.password, row.password_hash);
  if (!passwordMatches) {
    throw new HttpError(401, "Invalid email or password");
  }

  const user = toAuthUser(row, row.food_bank_name);
  return { token: signToken(user), user };
}
