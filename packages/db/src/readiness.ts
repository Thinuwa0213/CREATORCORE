export interface QueryableConnection {
  query(sql: string): Promise<unknown>;
}

/**
 * Minimal connectivity probe for apps/api's /ready endpoint — connects,
 * runs `SELECT 1`, and reports true/false. Never throws: a caller building
 * a readiness response must not have a DB outage turn into an unhandled
 * rejection or a leaked stack trace in the HTTP response. Depends on a
 * minimal structural interface rather than mysql2's full overloaded `Pool`
 * type so it can be exercised in a unit test without a real pool.
 */
export async function checkDatabaseConnectivity(pool: QueryableConnection): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
