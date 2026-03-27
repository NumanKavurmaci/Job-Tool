type SelectorValue = {
  count?: number;
  text?: string | null;
  attributes?: Record<string, string | null | undefined>;
  throwsOnInnerText?: boolean;
  throwsOnGetAttribute?: boolean;
};

type MockPageState = {
  selectors?: Record<string, SelectorValue>;
  currentUrl?: string;
  title?: string;
};

type MockPageContext = {
  filledValues: Record<string, string>;
  setState: (nextState: MockPageState) => void;
  getState: () => MockPageState;
};

type RouteValue = MockPageState | ((context: MockPageContext) => MockPageState);

class MockLocator {
  constructor(
    private readonly selector: string,
    private readonly getValue: () => SelectorValue | undefined,
    private readonly onFill?: (selector: string, value: string, context: MockPageContext) => void | Promise<void>,
    private readonly onClick?: (selector: string, context: MockPageContext) => void | Promise<void>,
    private readonly context?: MockPageContext,
  ) {}

  first(): MockLocator {
    return this;
  }

  async count(): Promise<number> {
    const value = this.getValue();
    return value?.count ?? (value ? 1 : 0);
  }

  async innerText(): Promise<string> {
    const value = this.getValue();
    if (value?.throwsOnInnerText) {
      throw new Error("innerText failed");
    }

    return value?.text ?? "";
  }

  async getAttribute(name: string): Promise<string | null> {
    const value = this.getValue();
    if (value?.throwsOnGetAttribute) {
      throw new Error("getAttribute failed");
    }

    return value?.attributes?.[name] ?? null;
  }

  async fill(value: string): Promise<void> {
    if (this.onFill && this.context) {
      await this.onFill(this.selector, value, this.context);
    }
  }

  async click(): Promise<void> {
    if (this.onClick && this.context) {
      await this.onClick(this.selector, this.context);
    }
  }
}

export function createMockPage(options?: {
  selectors?: Record<string, SelectorValue>;
  currentUrl?: string;
  title?: string;
  routes?: Record<string, RouteValue>;
  onFill?: (selector: string, value: string, context: MockPageContext) => void | Promise<void>;
  onClick?: (selector: string, context: MockPageContext) => void | Promise<void>;
}) {
  let state: MockPageState = {
    selectors: options?.selectors,
    currentUrl: options?.currentUrl,
    title: options?.title,
  };
  const filledValues: Record<string, string> = {};

  const context: MockPageContext = {
    filledValues,
    setState(nextState) {
      state = {
        selectors: nextState.selectors ?? state.selectors,
        currentUrl: nextState.currentUrl ?? state.currentUrl,
        title: nextState.title ?? state.title,
      };
    },
    getState() {
      return state;
    },
  };

  const resolveRoute = (url: string): MockPageState | undefined => {
    const route = options?.routes?.[url];
    if (!route) {
      return undefined;
    }

    return typeof route === "function" ? route(context) : route;
  };

  const goto = async (url?: string) => {
    if (!url) {
      return undefined;
    }

    const nextState = resolveRoute(url);
    state = {
      selectors: nextState?.selectors ?? options?.selectors,
      currentUrl: nextState?.currentUrl ?? url,
      title: nextState?.title ?? options?.title,
    };
    return undefined;
  };
  const waitForTimeout = async () => undefined;

  return {
    locator(selector: string) {
      return new MockLocator(
        selector,
        () => state.selectors?.[selector],
        options?.onFill,
        options?.onClick,
        context,
      );
    },
    url() {
      return state.currentUrl ?? "https://example.com/jobs/role";
    },
    title: async () => state.title ?? "Fallback Page Title",
    goto,
    waitForTimeout,
  };
}
