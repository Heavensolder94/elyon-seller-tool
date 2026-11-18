import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { uploadFinanceDocumentToDrive, downloadFinanceDocumentFromDrive } from "../lib/google-drive.js";

test("finance Drive backup preserves original bytes and verifies app-bound metadata", async () => {
  const documentId = "doc_test12345";
  const fileId = "1AbCdEfGhIjKlMnOpQrStUv";
  const folder = "elyon-finance-private-test";
  const file = Buffer.from("%PDF fake receipt data\n", "utf8");
  const sha256 = createHash("sha256").update(file).digest("hex");
  const names = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_DRIVE_BACKUP_FOLDER_ID"];
  const old = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const oldFetch = globalThis.fetch;
  process.env.GOOGLE_CLIENT_ID = "local-test-id";
  process.env.GOOGLE_CLIENT_SECRET = "local-test-secret";
  process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID = folder;
  let uploadCount = 0;
  let metadataCorrect = true;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("oauth2.googleapis.com/token")) {
      return { ok: true, json: async () => ({ access_token: "local-test-access-token" }) };
    }
    if (target.includes("upload/drive/v3/files")) {
      uploadCount++;
      const body = Buffer.from(options.body);
      assert.ok(body.includes(file), "original binary must appear unchanged inside multipart body");
      assert.ok(body.includes(Buffer.from(sha256, "utf8")));
      assert.ok(body.includes(Buffer.from("elyonFinanceDocument", "utf8")));
      return { ok: true, json: async () => ({ id: fileId }) };
    }
    if (target.includes("alt=media")) {
      return { ok: true, arrayBuffer: async () => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) };
    }
    if (target.includes("/drive/v3/files/")) {
      return {
        ok: true,
        json: async () => ({
          id: fileId, size: String(file.length), parents: [folder],
          appProperties: {
            elyonFinanceDocument: metadataCorrect ? "true" : "false",
            documentId, sha256,
          },
        }),
      };
    }
    throw new Error("Unexpected mock Drive URL: " + target);
  };
  try {
    const uploaded = await uploadFinanceDocumentToDrive({
      refreshToken: "test-refresh", documentId, sha256,
      fileName: "rechnung.pdf", mimeType: "application/pdf", base64: file.toString("base64"),
    });
    assert.equal(uploaded.fileId, fileId);
    assert.equal(uploadCount, 1);
    const restored = await downloadFinanceDocumentFromDrive({
      refreshToken: "test-refresh", fileId, documentId, sha256,
    });
    assert.equal(restored.base64, file.toString("base64"));

    await assert.rejects(
      uploadFinanceDocumentToDrive({
        refreshToken: "test-refresh", documentId, sha256: "0".repeat(64),
        fileName: "bad.pdf", mimeType: "application/pdf", base64: file.toString("base64"),
      }),
      /Prüfsumme/i,
    );
    metadataCorrect = false;
    await assert.rejects(
      downloadFinanceDocumentFromDrive({ refreshToken: "test-refresh", fileId, documentId, sha256 }),
      /gehört nicht/i,
    );
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
