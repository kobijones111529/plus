const pool = require("../pool");

/**
 * @template T
 * @param {() => Promise<import("pg").PoolClient>} createClient
 * @param {(client: import("pg").PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
const withPoolClient = async (createClient, fn) => {
  const client = await createClient();
  try {
    const res = await fn(client);
    client.release();
    return res;
  } catch (err) {
    client.release();
    throw err;
  }
};

/**
 * @template T
 * @template C
 * @param {C extends import("pg").ClientBase | import("pg").Pool ? C : never} client
 * @param {(client: C) => Promise<T>} fn
 * @returns {Promise<T>}
 */
const withTransaction = async (client, fn) => {
  client.query("BEGIN");
  try {
    const res = await fn(client);
    client.query("COMMIT");
    return res;
  } catch (err) {
    client.query("ROLLBACK");
    throw err;
  }
};

/**
 * @template C
 * @param {C extends import("pg").ClientBase | import("pg").Pool ? C : never} client
 * @returns {Promise<boolean>}
 */
const runSingleMatchWithClient = async (client) => {
  /**
   * @typedef Upload
   * @property {number} id
   * @property {number} averageRating
   */

  // Lock existing rows
  await client.query(
    `
        SELECT * FROM "uploads_for_matching"
        FOR UPDATE
      `
  );

  /** @type {import("pg").QueryResult<Upload>} */
  const { rows: firstUploadCandidates } = await client.query(
    `
      SELECT
        "id",
        "average_rating" AS "averageRating"
      FROM "uploads_for_matching"
      ORDER BY
        "last_matched_at" NULLS FIRST,
        "uploaded_at"
      LIMIT 1
    `
  );

  const firstUpload = firstUploadCandidates[0] || undefined;

  // Nothing found
  if (!firstUpload) {
    return false;
  }

  /** @type {import("pg").QueryResult<Upload>} */
  const { rows: secondUploadCandidates } = await client.query(
    `
      SELECT
        "uploads_for_matching"."id" AS "id",
        "uploads_for_matching"."average_rating" AS "averageRating"
      FROM "uploads_for_matching"
      LEFT JOIN "matches" "matches_left"
        ON "uploads_for_matching"."id" = "matches_left"."upload_1_id"
      LEFT JOIN "matches" "matches_right"
        ON "uploads_for_matching"."id" = "matches_right"."upload_2_id"
      WHERE
        "uploads_for_matching"."id" != $1
      GROUP BY "uploads_for_matching"."id"
      HAVING
        COUNT(CASE WHEN "matches_left"."upload_2_id" = $1 THEN 1 END) < 1
      AND
        COUNT(CASE WHEN "matches_right"."upload_1_id" = $1 THEN 1 END) < 1
      ORDER BY RANDOM()
      LIMIT 1
    `,
    [firstUpload.id]
  );
  const secondUpload = secondUploadCandidates[0] || undefined;

  // Nothing found
  if (!secondUpload) {
    return false;
  }

  await client.query(
    `
      INSERT INTO "matches"
        ("upload_1_id", "upload_2_id")
      VALUES
        ($1, $2)
    `,
    [firstUpload.id, secondUpload.id]
  );

  /**
   * @param {number} rating1
   * @param {number} rating2
   * @returns {1 | 2 | undefined}
   */
  const determineWinner = (rating1, rating2) => {
    switch (Math.sign(rating1 - rating2)) {
      case 1:
        return 1;
      case 0:
        return undefined;
      case -1:
        return 2;
    }
  };

  const winner = determineWinner(
    firstUpload.averageRating,
    secondUpload.averageRating
  );

  if (!winner) {
    const query = `
      UPDATE "uploads_for_matching"
      SET
        "total_matches" = "total_matches" + 1,
        "last_matched_at" = CURRENT_TIMESTAMP
      WHERE "id" = $1
    `;

    await client.query(query, [firstUpload.id]);
    await client.query(query, [secondUpload.id]);
    return true;
  }

  const transferAmount = 1;

  const query = `
    UPDATE "uploads_for_matching"
    SET
      "tokens" = "tokens" + $2,
      "total_matches" = "total_matches" + 1,
      "last_matched_at" = CURRENT_TIMESTAMP
    WHERE
      "id" = $1
  `;
  await client.query(query, [
    firstUpload.id,
    winner === 1 ? transferAmount : -transferAmount,
  ]);
  await client.query(query, [
    secondUpload.id,
    winner === 2 ? transferAmount : -transferAmount,
  ]);

  return true;
};

/**
 * @returns {Promise<boolean>} True if a match was performed
 */
const runSingleMatch = async () => {
  const res = await withPoolClient(
    async () => await pool.connect(),
    (client) => withTransaction(client, runSingleMatchWithClient)
  );
  return res;
};

module.exports = {
  runSingleMatch,
};