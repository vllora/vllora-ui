import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatConversation } from '../ChatConversation';
import { MessageStructure } from '@/utils/message-structure-from-span';

// Mock the dependencies
vi.mock('../HierarchiMessageItem', () => ({
  HierarchicalMessageSpanItem: vi.fn(({ messageStructure }) => (
    <div data-testid={`message-${messageStructure.span_id}`}>
      {messageStructure.span_id}
    </div>
  )),
}));

vi.mock('ahooks', () => ({
  useInViewport: () => [true],
}));

describe('ChatConversation', () => {
  const mockMessages: MessageStructure[] = [
    {
      span_id: 'span-1',
      type: 'run',
      children: [],
    },
    {
      span_id: 'span-2',
      type: 'task',
      children: [],
    },
  ];

  it('renders messages correctly', () => {
    render(<ChatConversation messages={mockMessages} />);

    expect(screen.getByTestId('message-span-1')).toBeInTheDocument();
    expect(screen.getByTestId('message-span-2')).toBeInTheDocument();
  });

  it('shows empty state when no messages and not loading', () => {
    render(<ChatConversation messages={[]} isLoading={false} />);

    expect(screen.getByText('Start a conversation')).toBeInTheDocument();
  });

  it('shows loading indicator when loading', () => {
    const { container } = render(<ChatConversation messages={[]} isLoading={true} />);

    // Look for the animated bounce divs
    const loadingDots = container.querySelectorAll('.animate-bounce');
    expect(loadingDots.length).toBe(3); // Should have 3 bouncing dots
  });

  it('does not re-render when same messages array reference is passed', () => {
    const { rerender, getByTestId } = render(<ChatConversation messages={mockMessages} />);

    expect(getByTestId('message-span-1')).toBeInTheDocument();
    expect(getByTestId('message-span-2')).toBeInTheDocument();

    // Re-render with same reference
    rerender(<ChatConversation messages={mockMessages} />);

    // Messages should still be rendered
    expect(getByTestId('message-span-1')).toBeInTheDocument();
    expect(getByTestId('message-span-2')).toBeInTheDocument();
  });

  it('re-renders when messages array length changes', () => {
    const { rerender, getByTestId } = render(<ChatConversation messages={mockMessages} />);

    expect(getByTestId('message-span-1')).toBeInTheDocument();
    expect(getByTestId('message-span-2')).toBeInTheDocument();

    const newMessages = [
      ...mockMessages,
      { span_id: 'span-3', type: 'agent', children: [] },
    ];

    rerender(<ChatConversation messages={newMessages} />);

    // Should have new message
    expect(getByTestId('message-span-3')).toBeInTheDocument();
  });

  it('re-renders when message span_id changes', () => {
    const { rerender, getByTestId, queryByTestId } = render(<ChatConversation messages={mockMessages} />);

    expect(getByTestId('message-span-1')).toBeInTheDocument();

    const modifiedMessages = [
      { ...mockMessages[0], span_id: 'span-1-modified' },
      mockMessages[1],
    ];

    rerender(<ChatConversation messages={modifiedMessages} />);

    // Should re-render with modified span_id
    expect(queryByTestId('message-span-1')).not.toBeInTheDocument();
    expect(getByTestId('message-span-1-modified')).toBeInTheDocument();
  });
});
