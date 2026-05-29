import "@testing-library/jest-dom";
// Load local .env so integration tests (DB/RLS) get DATABASE_URL/APP_DATABASE_URL etc.
// Unit tests ignore these; harmless when absent.
import { config } from "dotenv";
config({ path: ".env" });
