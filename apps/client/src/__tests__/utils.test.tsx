import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// Simple utility test
describe('Utils', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });
});

// Simple component test example
describe('React component test', () => {
  it('should render a simple component', () => {
    const TestComponent = () => <div>Hello World</div>;
    render(<TestComponent />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });
});
