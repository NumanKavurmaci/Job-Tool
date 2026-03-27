type SelectorValue = {
  count?: number;
  text?: string | null;
  attributes?: Record<string, string | null | undefined>;
  throwsOnInnerText?: boolean;
  throwsOnGetAttribute?: boolean;
};

class MockLocator {
  constructor(private readonly value?: SelectorValue) {}

  first(): MockLocator {
    return this;
  }

  async count(): Promise<number> {
    return this.value?.count ?? (this.value ? 1 : 0);
  }

  async innerText(): Promise<string> {
    if (this.value?.throwsOnInnerText) {
      throw new Error("innerText failed");
    }

    return this.value?.text ?? "";
  }

  async getAttribute(name: string): Promise<string | null> {
    if (this.value?.throwsOnGetAttribute) {
      throw new Error("getAttribute failed");
    }

    return this.value?.attributes?.[name] ?? null;
  }
}

export function createMockPage(options?: {
  selectors?: Record<string, SelectorValue>;
  currentUrl?: string;
  title?: string;
}) {
  const goto = async () => undefined;
  const waitForTimeout = async () => undefined;

  return {
    locator(selector: string) {
      return new MockLocator(options?.selectors?.[selector]);
    },
    url() {
      return options?.currentUrl ?? "https://example.com/jobs/role";
    },
    title: async () => options?.title ?? "Fallback Page Title",
    goto,
    waitForTimeout,
  };
}
