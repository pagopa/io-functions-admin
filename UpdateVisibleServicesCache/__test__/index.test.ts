import { Context } from "@azure/functions";
import { index as updateVisibleServiceCache } from "../index";

const mockContext = (input: unknown): Context =>
  (({
    bindings: {
      visibleServicesBlob: input
    },
    log: console
  } as unknown) as Context);

describe("UpdateVisibleServiceCache", () => {
  it.each`
    scenario            | input | visibleServicesCacheBlob | visibleServicesByScopeCacheBlob
    ${"on empty input"} | ${{}} | ${{ items: [] }}         | ${{ LOCAL: [], NATIONAL: [] }}
  `(
    "should succeed $title",
    async ({
      input,
      visibleServicesCacheBlob,
      visibleServicesByScopeCacheBlob
    }) => {
      const context = mockContext(input);

      await updateVisibleServiceCache(context);

      expect(context.bindings.visibleServicesCacheBlob).toEqual(
        visibleServicesCacheBlob
      );
      expect(context.bindings.visibleServicesByScopeCacheBlob).toEqual(
        visibleServicesByScopeCacheBlob
      );
    }
  );

  it.each`
    scenario              | input
    ${"on invalid input"} | ${"not-a-valid-input"}
  `("should fail $title", async ({ input }) => {
    const context = mockContext(input);

    await updateVisibleServiceCache(context);

    // out bindings aren't used
    expect(context.bindings.visibleServicesCacheBlob).toBe(undefined);
    expect(context.bindings.visibleServicesByScopeCacheBlob).toBe(undefined);
  });
});
