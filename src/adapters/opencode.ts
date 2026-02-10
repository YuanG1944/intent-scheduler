import { HttpJsonAdapter } from "./http-json";

// Legacy naming alias: keep opencode adapter id while sharing generic HTTP JSON execution logic.
export class OpencodeAdapter extends HttpJsonAdapter {
  constructor() {
    super("opencode");
  }
}
