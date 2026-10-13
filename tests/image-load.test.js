import test from "node:test";
import assert from "node:assert/strict";
import { createLatestImageLoader } from "../image-load.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("a slower old decode cannot replace the latest selected image", async () => {
  const oldDecode = deferred();
  const newDecode = deferred();
  const committed = [];
  const errors = [];
  const loader = createLatestImageLoader(
    (file) => file.name === "old.png" ? oldDecode.promise : newDecode.promise,
    (bitmap, file) => committed.push(file.name),
    (file) => errors.push(file.name),
  );
  const oldBitmap = { closed: false, close() { this.closed = true; } };
  const newBitmap = { closed: false, close() { this.closed = true; } };

  const oldRequest = loader.load({ name: "old.png" }, "baseline");
  const newRequest = loader.load({ name: "new.png" }, "baseline");
  newDecode.resolve(newBitmap);
  assert.equal(await newRequest, true);
  oldDecode.resolve(oldBitmap);
  assert.equal(await oldRequest, false);

  assert.deepEqual(committed, ["new.png"]);
  assert.equal(oldBitmap.closed, true);
  assert.equal(newBitmap.closed, false);
  assert.deepEqual(errors, []);
});

test("an outdated decode failure does not replace current status", async () => {
  const oldDecode = deferred();
  const newDecode = deferred();
  const errors = [];
  const loader = createLatestImageLoader(
    (file) => file.name === "old.png" ? oldDecode.promise : newDecode.promise,
    () => {},
    (file) => errors.push(file.name),
  );

  const oldRequest = loader.load({ name: "old.png" }, "current");
  const newRequest = loader.load({ name: "new.png" }, "current");
  newDecode.resolve({ close() {} });
  await newRequest;
  oldDecode.reject(new Error("stale failure"));
  assert.equal(await oldRequest, false);
  assert.deepEqual(errors, []);
});

test("invalidation disposes a pending decode before sample content is committed", async () => {
  const decode = deferred();
  const committed = [];
  const loader = createLatestImageLoader(
    () => decode.promise,
    (bitmap, file) => committed.push(file.name),
    () => {},
  );
  const fileRequest = loader.load({ name: "pending.png" }, "baseline");
  const sampleRevision = loader.invalidate("baseline");
  const decodedBitmap = { closed: false, close() { this.closed = true; } };
  decode.resolve(decodedBitmap);
  assert.equal(await fileRequest, false);
  assert.equal(loader.isCurrent("baseline", sampleRevision), true);
  assert.deepEqual(committed, []);
  assert.equal(decodedBitmap.closed, true);
});
