import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import placeholder1 from '../../assets/channel-placeholder-1.webp';
import placeholder2 from '../../assets/channel-placeholder-2.webp';
import placeholder3 from '../../assets/channel-placeholder-3.webp';
import {
  Button,
  ChannelArt,
  Field,
  getChannelArtPlaceholder,
  Input,
  SegmentedControl,
  StatusPill,
  ThemeToggle,
} from './index';

describe('Button component', () => {
  it('applies variant classes correctly', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-accent');

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-surface-2');

    rerender(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-danger/15');

    rerender(<Button variant="glass">Glass</Button>);
    expect(screen.getByRole('button')).toHaveClass('glass');
  });

  it('renders disabled state properly with disabled attributes and styling', () => {
    render(<Button disabled>Disabled Button</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:opacity-40');
  });
});

describe('Field component', () => {
  it('maintains accessible label association with getByLabelText', () => {
    render(
      <Field label="Channel Name" htmlFor="channel-name-input">
        <Input id="channel-name-input" defaultValue="Test Channel" />
      </Field>,
    );

    const input = screen.getByLabelText('Channel Name');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Test Channel');
  });
});

describe('SegmentedControl component', () => {
  it('renders radiogroup with radio items and aria-checked attributes', () => {
    const options = [
      { value: 'tab1', label: 'Tab 1' },
      { value: 'tab2', label: 'Tab 2' },
      { value: 'tab3', label: 'Tab 3' },
    ];
    const handleChange = vi.fn();

    render(
      <SegmentedControl ariaLabel="Tabs" options={options} value="tab2" onChange={handleChange} />,
    );

    const radiogroup = screen.getByRole('radiogroup', { name: 'Tabs' });
    expect(radiogroup).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAttribute('aria-checked', 'false');
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[2]).toHaveAttribute('aria-checked', 'false');
  });

  it('fires onChange callback when an option is clicked', () => {
    const options = [
      { value: 'one', label: 'One' },
      { value: 'two', label: 'Two' },
    ];
    const handleChange = vi.fn();

    render(<SegmentedControl options={options} value="one" onChange={handleChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Two' }));
    expect(handleChange).toHaveBeenCalledWith('two');
  });
});

describe('StatusPill component', () => {
  it('renders callers text correctly for various statuses', () => {
    const { rerender } = render(<StatusPill status="onair">PLAYING</StatusPill>);
    expect(screen.getByText('PLAYING')).toBeInTheDocument();

    rerender(<StatusPill status="idle">IDLE</StatusPill>);
    expect(screen.getByText('IDLE')).toBeInTheDocument();

    rerender(<StatusPill status="stopped">STOPPED</StatusPill>);
    expect(screen.getByText('STOPPED')).toBeInTheDocument();
  });
});

describe('ThemeToggle component', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePref;
  });

  it('changes document.documentElement.dataset.theme when toggled', () => {
    render(<ThemeToggle />);

    const lightRadio = screen.getByRole('radio', { name: /terang|light/i });
    fireEvent.click(lightRadio);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themePref).toBe('light');

    const darkRadio = screen.getByRole('radio', { name: /gelap|dark/i });
    fireEvent.click(darkRadio);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themePref).toBe('dark');
  });
});

describe('ChannelArt component', () => {
  it('picks placeholder deterministically based on channelId % 3', () => {
    expect(getChannelArtPlaceholder(0)).toBe(placeholder1);
    expect(getChannelArtPlaceholder(3)).toBe(placeholder1);
    expect(getChannelArtPlaceholder(1)).toBe(placeholder2);
    expect(getChannelArtPlaceholder(4)).toBe(placeholder2);
    expect(getChannelArtPlaceholder(2)).toBe(placeholder3);
    expect(getChannelArtPlaceholder(5)).toBe(placeholder3);

    const { rerender } = render(<ChannelArt channelId={1} />);
    const el = screen.getByTestId('channel-art');
    expect(el.style.backgroundImage).toContain(placeholder2);

    rerender(<ChannelArt channelId={1} src="custom-poster.jpg" />);
    expect(el.style.backgroundImage).toContain('custom-poster.jpg');
  });
});
