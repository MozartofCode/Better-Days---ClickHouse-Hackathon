CREATE TABLE IF NOT EXISTS uploads (
  id UUID DEFAULT generateUUIDv4(),
  food_bank_id UUID,
  uploaded_by_user_id UUID,
  filename String,
  columns Array(String),
  row_count UInt32,
  uploaded_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (food_bank_id, uploaded_at);

CREATE TABLE IF NOT EXISTS upload_rows (
  upload_id UUID,
  food_bank_id UUID,
  row_number UInt32,
  data Map(String, String),
  uploaded_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (food_bank_id, upload_id, row_number);
