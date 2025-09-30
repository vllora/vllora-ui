export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
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