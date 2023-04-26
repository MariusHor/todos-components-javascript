import { isEqual, get } from 'lodash';
import { store } from '../store';

export const Interface = ({ props, bindings = [], components, callbacks, listeners }) => {
  const { name, forceUpdate } = props;
  const root = `[data-root="${name}"]`;

  renderUI(props);

  const eventCallbacks = callbacks ? callbacks() : [];

  const eventListeners = listeners ? listeners({ root, callbacks: eventCallbacks }) : [];

  const childComponents = components ? components({ root, callbacks: eventCallbacks }) : [];

  addListeners(eventListeners);

  return ({ nextState, shouldRemove }) => {
    if (shouldRemove) {
      removeListeners(eventListeners);

      update$$({
        shouldRemove,
        components: [...childComponents],
      });

      cleanUI({ target: root });

      return;
    }

    if (!shouldRemove) {
      updateUI({
        nextState,
        bindings,
        forceUpdate,
      });

      update$$({ nextState, components: [...childComponents] });
    }
  };
};

export const addListener = ({ target, type = 'click', callback }) => {
  document.querySelector(target).addEventListener(type, callback);
};

export const removeListener = ({ target, type = 'click', callback }) => {
  document.querySelector(target).removeEventListener(type, callback);
};

const addListeners = (listeners) => {
  listeners.map((listener) =>
    addListener({
      target: listener.target,
      type: listener.type,
      callback: listener.callback,
    }),
  );
};

const removeListeners = (listeners) => {
  return listeners.map((listener) =>
    removeListener({
      target: listener.target,
      type: listener.type,
      callback: listener.callback,
    }),
  );
};

export const insertHtmlToDOM = ({ targetSelector, render, position = 'beforeend' }) => {
  document.querySelector(targetSelector).insertAdjacentHTML(position, render());
};

const insertElementToDOM = ({ target, position, element }) => {
  switch (position) {
    case 'afterend':
      target.after(element);
      break;
    case 'beforebegin':
      target.before(element);
      break;
    case 'prepend':
      target.prepend(element);
      break;
    default:
      target.append(element);
  }
};

const handleOptionalAttributes = (attributes, element) => {
  return attributes.optional.map((attribute) => {
    const { condition, name, value = '' } = attribute;

    if (condition()) element.setAttribute(name, value);
  });
};

const buildElement = ({ elementType, classes, attributes, textContent }) => {
  const element = document.createElement(elementType);

  if (classes) element.classList.add(...classes.split(' ').filter((cl) => cl !== ''));

  if (attributes)
    Object.entries(attributes).map(([key, value]) => {
      if (key === 'optional') {
        handleOptionalAttributes(attributes, element);

        return;
      }

      element.setAttribute(key, value);
    });

  if (textContent) element.textContent = textContent;

  return element;
};

export const renderUI = ({
  targetSelector,
  position = 'append',
  elementType,
  classes,
  textContent,
  attributes = {},
  childrenElements = [],
}) => {
  let element;

  const target = document.querySelector(targetSelector);

  if (elementType) {
    element = buildElement({ elementType, classes, attributes, textContent });
  }

  if (!elementType) element = document.createDocumentFragment();

  if (childrenElements)
    childrenElements.map((child) => {
      const childEl = renderUI(child);
      element.appendChild(childEl);
    });

  if (target) insertElementToDOM({ target, position, element });
  return element;
};

const renderFallback = ({ fallback, state, props }) => {
  const { targetSelector, position, targetIsSibling, fallbackElSelector } = props();

  const targetElement = targetIsSibling
    ? document.querySelector(targetSelector).parentNode
    : document.querySelector(targetSelector);

  const fallbackEl = targetElement.querySelector(fallbackElSelector);

  if (fallbackEl) return;

  const { render } = fallback({ state, props: props() });

  insertHtmlToDOM({
    targetSelector,
    position,
    render,
  });
};

const removeFallback = ({ props }) => {
  const { targetSelector, targetIsSibling, fallbackElSelector } = props();

  const targetElement = targetIsSibling
    ? document.querySelector(targetSelector).parentNode
    : document.querySelector(targetSelector);

  const fallbackEl = targetElement.querySelector(fallbackElSelector);

  if (fallbackEl) targetElement.removeChild(fallbackEl);
};

const filterList = ({ list, state, filter }) => {
  const { check, cases } = filter(state);

  const activeCase = cases.find((entry) => entry.value === check);

  return list.filter((entry) => activeCase.callback(entry));
};

const removeDeletedChildren = ({ childComponents, componentsData }) => {
  return childComponents.reduce((acc, component) => {
    const componentToPreserve = componentsData.find((item) => item.id === component.id);

    if (!componentToPreserve) {
      const index = childComponents.indexOf(component);

      if (index !== -1) {
        component.updateFn({ shouldRemove: true });
      }

      return acc;
    }

    return [...acc, component];
  }, []);
};

const updateCurrentChildComponents = ({ childComponents, componentsData, state }) => {
  return componentsData.reduce((acc, item) => {
    const existingChild = childComponents.find((component) => component.id === item.id);

    if (existingChild) {
      existingChild.updateFn({ nextState: state });
      return [...acc, existingChild];
    }

    return acc;
  }, []);
};

const createNewChildComponents = ({ childComponents, componentsData, component, state, props }) => {
  return componentsData.reduce((acc, item) => {
    const existingChild = childComponents.find((child) => child.id === item.id);

    if (!existingChild) {
      const newChild = {
        id: item.id,
        updateFn: component({
          initialState: state,
          props: props({ state, item }),
          item,
        }),
      };

      return [...acc, newChild];
    }

    return [...acc, existingChild];
  }, []);
};

export const $Component = ({ item, condition, state, component, props, fallback }) => {
  let updateFn;
  let isFirstUpdate = false;

  if (!condition || condition(state)) {
    updateFn = component({
      initialState: state,
      props: props({ state, item }),
    });
  }

  if (condition && !condition(state) && fallback) {
    renderFallback({ fallback, state, props });
  }

  return ({ nextState, shouldRemove }) => {
    if (shouldRemove) {
      updateFn({ shouldRemove });

      return;
    }

    if (!updateFn && (!condition || condition(nextState))) {
      if (fallback) removeFallback({ props });

      updateFn = component({
        initialState: nextState,
        props: props({ state: nextState, item }),
        item,
      });

      isFirstUpdate = true;
    }

    if (!isFirstUpdate && updateFn && (!condition || (condition && condition(nextState)))) {
      updateFn({ nextState });
    }

    if (!isFirstUpdate && condition && !condition(nextState) && updateFn) {
      updateFn({ shouldRemove: true });
      updateFn = null;

      if (fallback) renderFallback({ fallback, state: nextState, props });
    }

    isFirstUpdate = false;
  };
};

export const $$Components = ({ props, component, itemsList, filter, state, fallback }) => {
  let componentsData = [];
  let childComponents = [];

  componentsData = itemsList(state);

  if (filter) {
    componentsData = filterList({ list: componentsData, filter, state });
  }

  if (!componentsData.length && fallback) renderFallback({ fallback, state, props });

  childComponents = createNewChildComponents({
    childComponents,
    componentsData,
    component,
    state,
    props,
  });

  return ({ nextState, shouldRemove }) => {
    if (shouldRemove) {
      childComponents = removeDeletedChildren({
        childComponents,
        componentsData: [],
      });

      return;
    }

    componentsData = itemsList(nextState);

    if (filter) {
      componentsData = filterList({
        state: nextState,
        list: componentsData,
        filter,
      });
    }

    if (!componentsData.length && fallback) renderFallback({ fallback, state: nextState, props });

    if (componentsData.length && fallback) removeFallback({ props });

    childComponents = removeDeletedChildren({
      childComponents,
      componentsData,
    });

    childComponents = updateCurrentChildComponents({
      state: nextState,
      childComponents,
      componentsData,
    });

    childComponents = createNewChildComponents({
      state: nextState,
      childComponents,
      componentsData,
      component,
      props,
    });
  };
};

export const update$$ = ({ nextState, components, shouldRemove }) => {
  components.forEach((component) => {
    return component({ nextState, shouldRemove });
  });
};

const handleBindingType = ({ type, selector, nextState, path, action }) => {
  const elem = document.querySelector(selector);

  switch (type) {
    case 'text':
      elem.textContent = get(nextState, path);
      break;
    case 'attribute': {
      const stateValue = get(nextState, path);
      action(elem, stateValue);
      break;
    }
    case 'input':
      if (action) {
        const stateValue = get(nextState, path);
        action(elem, stateValue);
        return;
      }

      elem.value = get(nextState, path);
      break;

    case 'classes': {
      const stateValue = get(nextState, path);
      action(elem, stateValue);
      break;
    }
    default:
      return 'type unknown';
  }
};

const handleBinding = ({ type, selector, path, action }, nextState, forceUpdate) => {
  const prevState = store.getPrevState();

  const prevValue = get(prevState, path);
  const nextValue = get(nextState, path);

  if (isEqual(prevValue, nextValue) && !forceUpdate) return;

  handleBindingType({ type, selector, nextState, path, action });
};

export const updateUI = ({ nextState, bindings = [], forceUpdate }) => {
  bindings.forEach((binding) => {
    handleBinding(binding, nextState, forceUpdate);
  });
};

export const cleanUI = ({ target }) => {
  document.querySelector(target).remove();
};
