import assert from "node:assert/strict";
import { test } from "node:test";
import { appStoreUrl, resolveCampaign } from "../lib/app-store-link";

const PRODUCT_PAGE = "https://apps.apple.com/jp/app/id6781950004";

test("a tagged link carries both the provider id and the campaign", () => {
  assert.equal(
    appStoreUrl({ country: "TW", source: "threads", providerId: "123456" }),
    "https://apps.apple.com/tw/app/id6781950004?pt=123456&ct=threads&mt=8",
  );
});

test("an untagged link is the plain product page", () => {
  assert.equal(appStoreUrl({ country: null, source: null, providerId: "123456" }), PRODUCT_PAGE);
});

test("a campaign without a provider id is dropped, not half-sent", () => {
  // Apple ignores `ct` on its own, so sending it would only look like tracking.
  assert.equal(appStoreUrl({ country: "JP", source: "threads", providerId: null }), PRODUCT_PAGE);
});

test("the storefront falls back to Japan when the country is unusable", () => {
  for (const country of [null, "", "JPN", "j1", "../us"]) {
    assert.equal(appStoreUrl({ country, source: null, providerId: null }), PRODUCT_PAGE);
  }
  assert.equal(
    appStoreUrl({ country: " hk ", source: null, providerId: null }),
    "https://apps.apple.com/hk/app/id6781950004",
  );
});

test("a campaign name Apple would not accept is refused whole", () => {
  assert.equal(resolveCampaign("fb-group_tw"), "fb-group_tw");
  assert.equal(resolveCampaign(" reddit "), "reddit");
  for (const source of [null, "", "a b", "threads&pt=999", "社群", "x".repeat(41)]) {
    assert.equal(resolveCampaign(source), null);
  }
});

test("the shipped provider id is the one App Store Connect generated", () => {
  assert.equal(
    appStoreUrl({ country: "JP", source: "threads" }),
    "https://apps.apple.com/jp/app/id6781950004?pt=129057124&ct=threads&mt=8",
  );
});
