import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "./schema/index.js";

/** The Drizzle query interface type every repository function accepts as its first parameter. */
export type Db = MySql2Database<typeof schema>;
