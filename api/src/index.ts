import { app } from "./app";
import { env } from "./config/env";

app.listen(env.apiPort, () => {
  console.log(`API listening on port ${env.apiPort}`);
});
