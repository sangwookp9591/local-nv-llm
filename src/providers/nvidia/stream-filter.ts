export class StreamThinkFilter {
  private inThinkBlock = false;
  private buffer = "";

  public process(chunk: string): string {
    // If inside code block, bypass think tag filtering
    if (chunk.includes("```")) {
      return chunk;
    }

    this.buffer += chunk;
    let output = "";

    while (this.buffer.length > 0) {
      if (!this.inThinkBlock) {
        const startIdx = this.buffer.indexOf("<think>");
        if (startIdx !== -1) {
          output += this.buffer.slice(0, startIdx);
          this.buffer = this.buffer.slice(startIdx + 7);
          this.inThinkBlock = true;
        } else {
          // Check if buffer ends with partial "<think"
          const partialMatch = this.findPartialMatch(this.buffer, "<think>");
          if (partialMatch > 0) {
            output += this.buffer.slice(0, this.buffer.length - partialMatch);
            this.buffer = this.buffer.slice(this.buffer.length - partialMatch);
            break;
          } else {
            output += this.buffer;
            this.buffer = "";
          }
        }
      } else {
        const endIdx = this.buffer.indexOf("</think>");
        if (endIdx !== -1) {
          this.buffer = this.buffer.slice(endIdx + 8);
          this.inThinkBlock = false;
        } else {
          const partialMatch = this.findPartialMatch(this.buffer, "</think>");
          if (partialMatch > 0) {
            this.buffer = this.buffer.slice(this.buffer.length - partialMatch);
          } else {
            this.buffer = "";
          }
          break;
        }
      }
    }

    return output;
  }

  private findPartialMatch(str: string, target: string): number {
    for (let len = target.length - 1; len > 0; len--) {
      if (str.endsWith(target.slice(0, len))) {
        return len;
      }
    }
    return 0;
  }
}
