import { describe, expect, it } from "vitest";

describe('"." entry re-exports @kicbac/react', () => {
  it("exposes the provider, payment form, fields and hooks", async () => {
    const pkg = await import("../src/index.js");
    expect(pkg.KicbacProvider).toBeTypeOf("function");
    expect(pkg.KicbacPaymentForm).toBeTypeOf("function");
    expect(pkg.usePaymentForm).toBeTypeOf("function");
    expect(pkg.useKicbac).toBeTypeOf("function");
    expect(pkg.CardNumberField).toBeTypeOf("function");
    expect(pkg.CardExpiryField).toBeTypeOf("function");
    expect(pkg.CardCvvField).toBeTypeOf("function");
    expect(pkg.loadKicbac).toBeTypeOf("function");
  });

  it("does not leak server helpers into the client entry", async () => {
    const pkg = (await import("../src/index.js")) as Record<string, unknown>;
    expect(pkg["createKicbacRouteHandler"]).toBeUndefined();
    expect(pkg["kicbacWebhookHandler"]).toBeUndefined();
  });
});
