/**
 * Test write operations against the existing 'austin' bucket
 */
import { StorjClient } from "./dist/uplink.js";

const GRANT = process.env.STORJ_ACCESS_GRANT;
if (!GRANT) {
  console.error("Error: STORJ_ACCESS_GRANT env var is required (needs write access).\n  Run: STORJ_ACCESS_GRANT=your_grant node test-write.js");
  process.exit(1);
}

const BUCKET = "austin";
const KEY = "test/hello-openclaw.txt";
const DATA = Buffer.from("Hello from OpenClaw Storj plugin! " + new Date().toISOString());

const client = StorjClient.open(GRANT);

console.log("Testing write operations against bucket:", BUCKET);

// Upload
try {
  console.log("\n1. Upload...");
  const result = client.uploadBytes(BUCKET, KEY, DATA);
  console.log("   ✓ Uploaded:", result.key, `(${DATA.length} bytes)`);
} catch (err) {
  console.log("   ✗ Upload failed:", err.message.split("\n")[0]);
  client.close();
  process.exit(1);
}

// List
try {
  console.log("\n2. List objects...");
  const objects = client.listObjects(BUCKET);
  console.log("   ✓ Found", objects.length, "object(s):");
  for (const o of objects) {
    console.log(`     - ${o.key} (${o.contentLength} bytes)`);
  }
} catch (err) {
  console.log("   ✗ List failed:", err.message.split("\n")[0]);
}

// Stat
try {
  console.log("\n3. Stat object...");
  const obj = client.statObject(BUCKET, KEY);
  console.log("   ✓ Key:", obj.key, "Size:", obj.contentLength, "bytes");
} catch (err) {
  console.log("   ✗ Stat failed:", err.message.split("\n")[0]);
}

// Download
try {
  console.log("\n4. Download...");
  const data = client.downloadBytes(BUCKET, KEY);
  console.log("   ✓ Downloaded:", data.length, "bytes");
  console.log("   Content:", data.toString());
  const match = data.toString() === DATA.toString();
  console.log("   Content match:", match ? "✓ YES" : "✗ NO");
} catch (err) {
  console.log("   ✗ Download failed:", err.message.split("\n")[0]);
}

// Delete
try {
  console.log("\n5. Delete...");
  client.deleteObject(BUCKET, KEY);
  console.log("   ✓ Deleted:", KEY);
} catch (err) {
  console.log("   ✗ Delete failed:", err.message.split("\n")[0]);
}

// Verify deleted
try {
  console.log("\n6. Verify deleted...");
  client.statObject(BUCKET, KEY);
  console.log("   ✗ Object still exists!");
} catch (err) {
  console.log("   ✓ Confirmed deleted (got expected error)");
}

client.close();
console.log("\nDone.");
