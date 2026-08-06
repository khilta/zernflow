import { describe, it, expect } from "vitest";
import { adaptMessage } from "./platform-adapter";

/**
 * WhatsApp used to share the Facebook/Instagram branch, which emits Messenger
 * shapes WhatsApp has no equivalent for. It was unreachable while WhatsApp
 * channels could not be stored; issue #16 made it reachable.
 */
describe("adaptMessage for whatsapp", () => {
  it("degrades a carousel to numbered text instead of a generic template", () => {
    const adapted = adaptMessage(
      {
        text: "Pick one",
        carousel: {
          elements: [
            { title: "Basic", subtitle: "10/mo", buttons: [{ title: "Buy", type: "url", url: "https://example.com/basic" }] },
            { title: "Pro", subtitle: "20/mo" },
          ],
        },
      },
      "whatsapp"
    );

    expect(adapted.template).toBeUndefined();
    expect(adapted.text).toContain("1. Basic");
    expect(adapted.text).toContain("2. Pro");
    expect(adapted.text).toContain("https://example.com/basic");
  });

  it("keeps a link button's URL by rendering it as text", () => {
    const adapted = adaptMessage(
      { text: "Docs", buttons: [{ title: "Open", type: "url", url: "https://example.com" }] },
      "whatsapp"
    );

    expect(adapted.buttons).toBeUndefined();
    expect(adapted.text).toContain("https://example.com");
  });

  it("passes through up to three reply buttons", () => {
    const buttons = [
      { title: "Yes", type: "postback" as const, payload: "yes" },
      { title: "No", type: "postback" as const, payload: "no" },
    ];
    const adapted = adaptMessage({ text: "Confirm?", buttons }, "whatsapp");

    expect(adapted.buttons).toEqual(buttons);
    expect(adapted.text).toBe("Confirm?");
  });

  it("degrades to text when there are more options than Meta accepts", () => {
    const adapted = adaptMessage(
      {
        text: "Pick",
        quickReplies: [
          { title: "A", payload: "a" },
          { title: "B", payload: "b" },
          { title: "C", payload: "c" },
          { title: "D", payload: "d" },
        ],
      },
      "whatsapp"
    );

    expect(adapted.quickReplies).toBeUndefined();
    expect(adapted.text).toContain("4. D");
  });

  it("still gives Facebook the generic template carousel", () => {
    const adapted = adaptMessage(
      { carousel: { elements: [{ title: "Basic" }] } },
      "facebook"
    );

    expect(adapted.template?.type).toBe("generic");
  });
});
