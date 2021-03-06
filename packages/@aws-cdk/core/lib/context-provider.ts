import { Construct } from './construct';
import { Stack } from './stack';
import { Token } from './token';

export interface GetContextKeyOptions {
  /**
   * The context provider to query.
   */
  readonly provider: string;

  /**
   * Provider-specific properties.
   */
  readonly props?: { [key: string]: any };
}

export interface GetContextValueOptions extends GetContextKeyOptions {
  /**
   * The value to return if the context value was not found and a missing
   * context is reported. This should be a dummy value that should preferably
   * fail during deployment since it represents an invalid state.
   */
  readonly dummyValue: any;
}

export interface GetContextKeyResult {
  readonly key: string;
  readonly props: { [key: string]: any };
}

export interface GetContextValueResult {
  readonly value?: any;
}

/**
 * Base class for the model side of context providers
 *
 * Instances of this class communicate with context provider plugins in the 'cdk
 * toolkit' via context variables (input), outputting specialized queries for
 * more context variables (output).
 *
 * ContextProvider needs access to a Construct to hook into the context mechanism.
 */
export class ContextProvider {
  /**
   * @returns the context key or undefined if a key cannot be rendered (due to tokens used in any of the props)
   */
  public static getKey(scope: Construct, options: GetContextKeyOptions): GetContextKeyResult {
    const stack = Stack.of(scope);

    const props = {
      account: stack.account,
      region: stack.region,
      ...options.props || {},
    };

    if (Object.values(props).find(x => Token.isUnresolved(x))) {
      throw new Error(
        `Cannot determine scope for context provider ${options.provider}.\n` +
        `This usually happens when one or more of the provider props have unresolved tokens`);
    }

    const propStrings = propsToArray(props);
    return {
      key: `${options.provider}:${propStrings.join(':')}`,
      props
    };
  }

  public static getValue(scope: Construct, options: GetContextValueOptions): any {
    const stack = Stack.of(scope);

    if (Token.isUnresolved(stack.account) || Token.isUnresolved(stack.region)) {
      throw new Error(`Cannot retrieve value from context provider ${options.provider} since account/region ` +
                      `are not specified at the stack level. Either configure "env" with explicit account and region when ` +
                      `you define your stack, or use the environment variables "CDK_DEFAULT_ACCOUNT" and "CDK_DEFAULT_REGION" ` +
                      `to inherit environment information from the CLI (not recommended for production stacks)`);
    }

    const { key, props } = this.getKey(scope, options);
    const value = scope.node.tryGetContext(key);

    // if context is missing, report and return a dummy value
    if (value === undefined) {
      stack.reportMissingContext({ key, props, provider: options.provider, });
      return options.dummyValue;
    }

    return value;
  }

  private constructor() { }
}

/**
 * Quote colons in all strings so that we can undo the quoting at a later point
 *
 * We'll use $ as a quoting character, for no particularly good reason other
 * than that \ is going to lead to quoting hell when the keys are stored in JSON.
 */
function colonQuote(xs: string): string {
  return xs.replace('$', '$$').replace(':', '$:');
}

function propsToArray(props: {[key: string]: any}, keyPrefix = ''): string[] {
  const ret: string[] = [];

  for (const key of Object.keys(props)) {
    switch (typeof props[key]) {
      case 'object': {
        ret.push(...propsToArray(props[key], `${keyPrefix}${key}.`));
        break;
      }
      case 'string': {
        ret.push(`${keyPrefix}${key}=${colonQuote(props[key])}`);
        break;
      }
      default: {
        ret.push(`${keyPrefix}${key}=${JSON.stringify(props[key])}`);
        break;
      }
    }
  }

  ret.sort();
  return ret;
}
