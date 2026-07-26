import test from "node:test";
import assert from "node:assert/strict";
import { injectMarkedBlock, insertBeforeFinalClosingBody } from "../scripts/html-injection.mjs";

test("inserts after JavaScript template body strings and before the real closing body", () => {
  const html = [
    "<!doctype html>",
    "<html>",
    "<body>",
    "<script>",
    "const template = '<html><body><p>Export</p></body></html>';",
    "</script>",
    "<main>Seller Tool</main>",
    "</body>",
    "</html>",
  ].join("\n");

  const result = insertBeforeFinalClosingBody(html, '<script defer src="/seller-auth.js"></script>');
  const inlineScriptEnd = result.indexOf("</script>");
  const authScript = result.indexOf('<script defer src="/seller-auth.js"></script>');
  const finalBody = result.lastIndexOf("</body>");

  assert.ok(authScript > inlineScriptEnd, "auth script must not be inserted into the inline script");
  assert.ok(authScript < finalBody, "auth script must be inserted before the final body close");
  assert.match(result, /const template = '<html><body><p>Export<\/p><\/body><\/html>';/);
});

test("marked injection is idempotent", () => {
  const html = "<html><body><main>App</main></body></html>";
  const options = {
    startMarker: "<!-- START -->",
    endMarker: "<!-- END -->",
    content: '<script src="/auth.js"></script>',
  };

  const once = injectMarkedBlock(html, options);
  const twice = injectMarkedBlock(once, options);

  assert.equal((twice.match(/<!-- START -->/g) || []).length, 1);
  assert.equal((twice.match(/<script src="\/auth.js"><\/script>/g) || []).length, 1);
  assert.ok(twice.indexOf("<!-- START -->") < twice.lastIndexOf("</body>"));
});

test("appends safely when no closing body exists", () => {
  const result = insertBeforeFinalClosingBody("<main>App</main>", "<!-- BLOCK -->");
  assert.equal(result, "<main>App</main>\n<!-- BLOCK -->\n");
});
