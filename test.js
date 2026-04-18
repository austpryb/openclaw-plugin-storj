/**
 * Integration tests for Storj uplink FFI bindings.
 * Runs read-only tests against the existing bucket, plus write tests if permissions allow.
 * Run: node test.js
 */
import { StorjClient } from "./dist/uplink.js";

const ACCESS_GRANT = process.env.STORJ_ACCESS_GRANT;
if (!ACCESS_GRANT) {
  console.error("Error: STORJ_ACCESS_GRANT env var is required.\n  Run: STORJ_ACCESS_GRANT=your_grant node test.js");
  process.exit(1);
}

let passed = 0;
let failed = 0;
let skipped = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err.message.split("\n")[0]}`);
    failed++;
  }
}

function skip(name, reason) {
  console.log(`  \x1b[33m⊘\x1b[0m ${name} — ${reason}`);
  skipped++;
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

console.log("\n=== Storj Uplink Integration Tests ===\n");

// -------------------------------------------------------------------------
// 1. Connection
// -------------------------------------------------------------------------
console.log("Connection:");
let client;

test("open client with valid access grant", () => {
  client = StorjClient.open(ACCESS_GRANT);
  assert(client, "client should not be null");
});

test("reject invalid access grant", () => {
  try {
    StorjClient.open("not-a-valid-grant");
    throw new Error("Should have thrown");
  } catch (err) {
    assert(err.name === "StorjError", `Expected StorjError, got ${err.name}`);
  }
});

if (!client) {
  console.error("\nCannot proceed without client. Exiting.\n");
  process.exit(1);
}

// -------------------------------------------------------------------------
// 2. List buckets
// -------------------------------------------------------------------------
console.log("\nBuckets:");
let buckets;

test("list buckets returns array", () => {
  buckets = client.listBuckets();
  assert(Array.isArray(buckets), `Expected array, got ${typeof buckets}`);
});

test("buckets have name and created fields", () => {
  assert(buckets.length > 0, "Expected at least one bucket");
  for (const b of buckets) {
    assert(typeof b.name === "string" && b.name.length > 0, `Invalid bucket name: ${b.name}`);
    assert(typeof b.created === "number" && b.created > 0, `Invalid created: ${b.created}`);
  }
  console.log(`    found: ${buckets.map(b => b.name).join(", ")}`);
});

// -------------------------------------------------------------------------
// 3. List objects (read-only against existing bucket)
// -------------------------------------------------------------------------
const EXISTING_BUCKET = buckets?.[0]?.name;

if (EXISTING_BUCKET) {
  console.log(`\nObjects (bucket: ${EXISTING_BUCKET}):`);
  let objects;

  test("list objects returns array", () => {
    objects = client.listObjects(EXISTING_BUCKET);
    assert(Array.isArray(objects), `Expected array, got ${typeof objects}`);
    console.log(`    found ${objects.length} object(s)`);
  });

  test("objects have correct fields", () => {
    if (objects.length === 0) {
      console.log("    (empty bucket — skipping field check)");
      return;
    }
    for (const o of objects.slice(0, 3)) {
      assert(typeof o.key === "string", `Invalid key: ${o.key}`);
      assert(typeof o.isPrefix === "boolean", `Invalid isPrefix: ${o.isPrefix}`);
      assert(typeof o.contentLength === "number", `Invalid contentLength: ${o.contentLength}`);
      assert(typeof o.created === "number", `Invalid created: ${o.created}`);
      console.log(`    - ${o.key} (${o.contentLength} bytes)`);
    }
    if (objects.length > 3) console.log(`    ... and ${objects.length - 3} more`);
  });

  test("list objects with prefix filter", () => {
    const all = client.listObjects(EXISTING_BUCKET, { recursive: true });
    // Just verify it doesn't crash with prefix
    const filtered = client.listObjects(EXISTING_BUCKET, { prefix: "nonexistent-prefix/" });
    assert(Array.isArray(filtered), "Prefix filter should return array");
    console.log(`    all: ${all.length}, filtered: ${filtered.length}`);
  });

  // Stat an existing object if any exist
  if (objects && objects.length > 0 && !objects[0].isPrefix) {
    test("stat existing object", () => {
      const obj = client.statObject(EXISTING_BUCKET, objects[0].key);
      assert(obj.key === objects[0].key, `Key mismatch: ${obj.key} vs ${objects[0].key}`);
      assert(obj.contentLength >= 0, `Invalid content length: ${obj.contentLength}`);
      console.log(`    ${obj.key}: ${obj.contentLength} bytes`);
    });
  }

  test("stat nonexistent object throws", () => {
    try {
      client.statObject(EXISTING_BUCKET, "this-key-definitely-does-not-exist-" + Date.now());
      throw new Error("Should have thrown");
    } catch (err) {
      assert(err.name === "StorjError", `Expected StorjError, got ${err.name}: ${err.message}`);
    }
  });
} else {
  skip("object tests", "no buckets found");
}

// -------------------------------------------------------------------------
// 4. Write operations (may fail with permission denied — that's OK)
// -------------------------------------------------------------------------
console.log("\nWrite operations:");
const TEST_BUCKET = "openclaw-test-" + Date.now();
let canWrite = false;

test("create bucket (requires write permission)", () => {
  try {
    const bucket = client.createBucket(TEST_BUCKET);
    assert(bucket.name === TEST_BUCKET, `Expected ${TEST_BUCKET}, got ${bucket.name}`);
    canWrite = true;
    console.log(`    created: ${bucket.name}`);
  } catch (err) {
    if (err.code === 9) { // PERMISSION_DENIED
      skip("create bucket", "access grant lacks write permission");
      return;
    }
    throw err;
  }
});

if (canWrite) {
  const TEST_KEY = "test/hello.txt";
  const TEST_DATA = Buffer.from("Hello from OpenClaw Storj plugin! " + new Date().toISOString());

  test("upload bytes", () => {
    const result = client.uploadBytes(TEST_BUCKET, TEST_KEY, TEST_DATA);
    assert(result.key === TEST_KEY, `Key mismatch: ${result.key}`);
    console.log(`    uploaded ${TEST_DATA.length} bytes`);
  });

  test("download bytes matches upload", () => {
    const data = client.downloadBytes(TEST_BUCKET, TEST_KEY);
    assert(Buffer.isBuffer(data), "Should return Buffer");
    assert(data.length === TEST_DATA.length, `Size mismatch: ${data.length} vs ${TEST_DATA.length}`);
    assert(data.toString() === TEST_DATA.toString(), "Content mismatch");
    console.log(`    verified ${data.length} bytes match`);
  });

  test("stat uploaded object", () => {
    const obj = client.statObject(TEST_BUCKET, TEST_KEY);
    assert(obj.key === TEST_KEY, `Key mismatch: ${obj.key}`);
    assert(obj.contentLength === TEST_DATA.length, `Size mismatch: ${obj.contentLength}`);
  });

  test("delete object", () => {
    client.deleteObject(TEST_BUCKET, TEST_KEY);
    try {
      client.statObject(TEST_BUCKET, TEST_KEY);
      throw new Error("Object should be deleted");
    } catch (err) {
      assert(err.name === "StorjError", "Expected StorjError after delete");
    }
  });

  test("delete test bucket", () => {
    client.deleteBucket(TEST_BUCKET);
  });
} else {
  skip("upload/download/delete", "no write permission — grant is read-only");
}

// -------------------------------------------------------------------------
// 5. Cleanup
// -------------------------------------------------------------------------
console.log("\nCleanup:");
test("close client", () => {
  client.close();
});

test("double close is safe", () => {
  client.close(); // should not throw
});

// -------------------------------------------------------------------------
// Results
// -------------------------------------------------------------------------
console.log(`\n=== Results: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m, \x1b[33m${skipped} skipped\x1b[0m ===\n`);
process.exit(failed > 0 ? 1 : 0);
