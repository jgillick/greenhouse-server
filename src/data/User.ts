import { v4 as uuid } from "uuid";
import { clickhouse } from "../lib/clickhouse";

export type UserRecord = {
  id: string;
  alias_id?: string;
  created_at?: number;
  updated_at?: number;
  is_deleted: number;
  [key: string]: any;
};

/**
 * Data model for a user record
 */
export const User = {
  RESERVED_COLUMNS: ["id", "created_at", "updated_at", "is_deleted"],

  /**
   * Get user records by IDs or alias IDs
   */
  async get(ids: string[]): Promise<UserRecord[]> {
    return clickhouse
      .query({
        query_params: { ids },
        query: `
          SELECT
            DISTINCT ON (user.id)
            user.*,
            user_alias.id as alias_id
          FROM user
          JOIN user_alias ON user_alias.user_id = user.id
          WHERE
            (
              user.id in ({ids: Array(UUID)})
              OR user_alias.alias in ({ids: Array(String)})
            )
            AND user.is_deleted = 0
          ORDER BY updated_at DESC
        `,
        format: "JSONEachRow",
      })
      .then((result) => result.json<UserRecord[]>());
  },

  /**
   * Get user record by ID or alias ID
   */
  async getOne(id: string): Promise<UserRecord> {
    return this.get([id]).then((list) => list[0]);
  },

  /**
   * Create new user record
   */
  async create() {
    const id = uuid();
    await clickhouse.insert({
      table: "user",
      values: [{ id, sign: 1 }],
      format: "JSONEachRow",
    });
    return id;
  },

  /**
   * Set properties on user object
   */
  async update(data: UserRecord[]) {
    const now = Math.round(Date.now() / 1000);
    await clickhouse.insert({
      table: "user",
      values: data.map((item) => ({ ...item, updated_at: now })),
      format: "JSONEachRow",
    });
  },

  /**
   * Get table columns
   */
  async getColumns() {
    const rows = await clickhouse
      .query({ query: `DESCRIBE user` })
      .then((resultSet) => resultSet.json<{ data: any[] }>())
      .then((results) => results.data);
    return rows.map<string>((row) => row.name);
  },

  /**
   * Set the update time on a list of user properties
   */
  async setPropertyTimes(userId: string, properties: string[]) {
    await clickhouse.insert({
      table: "user_property_time",
      values: properties.map((property) => ({ user_id: userId, property })),
      format: "JSONEachRow",
    });
  },

  /**
   * Return the most recent properties from two user records.
   * This is used when merging two user records
   */
  async mostRecentUserProperties(userIdA: string, userIdB: string) {
    return clickhouse
      .query({
        query_params: { userIdA, userIdB },
        query: `
          SELECT
            DISTINCT ON (property)
            user_id,
            property
          FROM user_property_time
          WHERE user_id IN ({userIdA: UUID}, {userIdB: UUID})
          ORDER BY timestamp DESC
        `,
        format: "JSONEachRow",
      })
      .then((resultSet) => {
        return resultSet.json<{ user_id: string; property: string }[]>();
      });
  },
};
