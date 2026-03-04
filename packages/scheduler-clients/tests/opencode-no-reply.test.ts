import { describe, expect, test } from "bun:test";
import { decideNoReply } from "../src/integrators/opencode/sdk";

describe("opencode no_reply decision", () => {
  test("question-like text returns noReply=false in auto mode", () => {
    const noReply = decideNoReply(
      { text: "请每30秒提问：你好么?" },
      true,
      "auto",
    );
    expect(noReply).toBe(false);
  });

  test("notification-like text returns noReply=true in auto mode", () => {
    const noReply = decideNoReply(
      { text: "每30秒发送通知：系统运行正常" },
      true,
      "auto",
    );
    expect(noReply).toBe(true);
  });

  test("metadata override has highest priority in auto mode", () => {
    const noReply = decideNoReply(
      { text: "请提问：你好么?", metadata: { no_reply: true } },
      false,
      "auto",
    );
    expect(noReply).toBe(true);
  });

  test("text analysis request without question mark still expects reply", () => {
    const noReply = decideNoReply(
      { text: "每30秒请你总结一下当前目录的变化" },
      true,
      "auto",
    );
    expect(noReply).toBe(false);
  });

  test("explicit no-reply phrase wins over question hints", () => {
    const noReply = decideNoReply(
      { text: "每30秒提问一下构建状态，不需要回复，只做通知" },
      false,
      "auto",
    );
    expect(noReply).toBe(true);
  });
});
