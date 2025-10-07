export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export const tryParseJson = (str: string) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return undefined;
  }
}

export const tryParseFloat = (str: string) => {
  try {
    return parseFloat(str);
  } catch (e) {
    return undefined;
  }
}

export const tryParseInt = (str: string) => {
  try {
    return parseInt(str);
  } catch (e) {
    return undefined;
  }
}

export const getModelTypeDisplayName = (type: string) => {
  switch (type) {
    case 'image_generation':
      return 'Image Generation';
    case 'chat':
      return 'Chat';
    case 'completion':
      return 'Completion';
    case 'embedding':
      return 'Embedding';
    case 'moderation':
      return 'Moderation';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}