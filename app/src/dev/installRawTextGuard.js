import React from 'react';
import { Text } from 'react-native';

const shouldWrapStringChild = (value) => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return true;
  return false;
};

const isTextType = (type) => type === Text || type?.displayName === 'Text' || type?.name === 'Text';

const normalizeChild = (child, origCreateElement) => {
  if (Array.isArray(child)) {
    return child.map((nested) => normalizeChild(nested, origCreateElement));
  }

  if (shouldWrapStringChild(child)) {
    return origCreateElement(Text, null, String(child));
  }

  return child;
};

export default function installRawTextGuard() {
  if (!__DEV__) return;
  if (global.__mrs_raw_text_guard_installed) return;

  const origCreateElement = React.createElement;

  React.createElement = function patchedCreateElement(type, props, ...children) {
    if (!type || isTextType(type) || !children || children.length === 0) {
      return origCreateElement(type, props, ...children);
    }

    let mutated = false;
    const nextChildren = children.map((child) => {
      const normalized = normalizeChild(child, origCreateElement);
      if (normalized !== child) mutated = true;
      return normalized;
    });

    if (mutated) {
      // This stack points to the JSX source location in dev.
      // eslint-disable-next-line no-console
      console.warn('Raw text child auto-wrapped in <Text>. Trace:', new Error().stack);
      return origCreateElement(type, props, ...nextChildren);
    }

    return origCreateElement(type, props, ...children);
  };

  global.__mrs_raw_text_guard_installed = true;
}
