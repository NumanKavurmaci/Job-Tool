import dotenv from "dotenv";

dotenv.config();

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function createEnv() {
  return {
    OPENAI_API_KEY: required("OPENAI_API_KEY"),
    DATABASE_URL: required("DATABASE_URL"),
  };
}

export const env = createEnv();
