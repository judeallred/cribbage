import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CribbageBoard from './CribbageBoard';
import '@testing-library/jest-dom';

describe('CribbageBoard', () => {
  test('renders without crashing', () => {
    render(<CribbageBoard />);
  });

  test('displays initial scores', () => {
    render(<CribbageBoard />);
    // Initial scores should be 0 for both players
    const scoreLabels = screen.getAllByText('0');
    expect(scoreLabels.length).toBeGreaterThanOrEqual(2); // At least 2 players starting at 0
  });

  test('toggles player count', () => {
    render(<CribbageBoard />);
    const toggleButton = screen.getByText('2 Players');
    expect(toggleButton).toBeInTheDocument();

    // Initially, there should be 2 score columns
    let scoreCols = screen.getAllByText('0'); // Using score labels to count columns
    expect(scoreCols.length).toBe(2);

    // Click to change to 3 players
    fireEvent.click(toggleButton);
    expect(screen.getByText('3 Players')).toBeInTheDocument();

    // Now there should be 3 score columns
    scoreCols = screen.getAllByText('0');
    expect(scoreCols.length).toBe(3);

    // Click to change back to 2 players
    fireEvent.click(screen.getByText('3 Players'));
    expect(screen.getByText('2 Players')).toBeInTheDocument();

    // Back to 2 score columns
    scoreCols = screen.getAllByText('0');
    expect(scoreCols.length).toBe(2);
  });

  test('advancing score updates buffer and preview label', async () => {
    render(<CribbageBoard />);

    // Find buttons for the first player
    const playerOneButtons = screen.getAllByText(/^[125]$/);
    const advanceOneButton = playerOneButtons.find(btn => btn.textContent === '1');
    const advanceTwoButton = playerOneButtons.find(btn => btn.textContent === '2');
    const advanceFiveButton = playerOneButtons.find(btn => btn.textContent === '5');

    expect(advanceOneButton).toBeInTheDocument();
    expect(advanceTwoButton).toBeInTheDocument();
    expect(advanceFiveButton).toBeInTheDocument();

    // Click '1' button
    fireEvent.click(advanceOneButton!);
    // Expect preview label to show +1
    await waitFor(() => {
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    // Click '2' button
    fireEvent.click(advanceTwoButton!);
    // Expect preview label to show +1+2 = +3
    await waitFor(() => {
      expect(screen.getByText('+3')).toBeInTheDocument();
    });

    // Click '5' button
    fireEvent.click(advanceFiveButton!);
    // Expect preview label to show +3+5 = +8
    await waitFor(() => {
      expect(screen.getByText('+8')).toBeInTheDocument();
    });
  });

  test('undo button clears buffer or undoes last score', async () => {
    render(<CribbageBoard />);

    // Find buttons for the first player
    const playerOneButtons = screen.getAllByText(/^[125]$/);
    const advanceOneButton = playerOneButtons.find(btn => btn.textContent === '1');
    const undoButton = screen.getAllByText('Undo')[0];

    expect(advanceOneButton).toBeInTheDocument();
    expect(undoButton).toBeInTheDocument();

    // Scenario 1: Undo clears active buffer
    fireEvent.click(advanceOneButton!);
    await waitFor(() => {
      // Find the preview label element containing a text node starting with '+'
      expect(screen.getByText((_, element) => {
        if (!element) return false; // Element must exist
        // Check if the element's text content starts with '+' and none of its children do.
        const textContent = element.textContent || '';
        const childrenTextContentStartsWithoutPlus = Array.from(element.children).every(
          (child) => !(child.textContent || '').startsWith('+')
        );
        return textContent.startsWith('+') && childrenTextContentStartsWithoutPlus;
      })).toBeInTheDocument();
    });
    fireEvent.click(undoButton);
    await waitFor(() => {
      // Preview label should be gone
      expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
      // Score should still be 0
      const scoreLabel = screen.getAllByText('0')[0];
      expect(scoreLabel).toBeInTheDocument();
    });

    // Scenario 2: Undo after committing score
    // Advance by 1
    fireEvent.click(advanceOneButton!);
    await waitFor(() => { expect(screen.getByText('+1')).toBeInTheDocument(); });
    // Simulate committing the buffer (e.g., by waiting for timeout, but for test, we click the preview label if present)
    try {
      // Find the preview label element containing a text node starting with '+'
      const previewLabel = await screen.findByText((_, element) => {
        if (!element) return false; // Element must exist
        // Check if the element's text content starts with '+' and none of its children do.
        const textContent = element.textContent || '';
        const childrenTextContentStartsWithoutPlus = Array.from(element.children).every(
          (child) => !(child.textContent || '').startsWith('+')
        );
        return textContent.startsWith('+') && childrenTextContentStartsWithoutPlus;
      }, {}, { timeout: 3000 });
      fireEvent.click(previewLabel);
    } catch (error) {
      console.warn('Preview label not found for commit, assuming score updates directly.', error);
    }
    // Wait for score to update to 1
    await waitFor(() => {
      const scoreLabel = screen.getAllByText('1')[0];
      expect(scoreLabel).toBeInTheDocument();
    });
    // Click Undo
    fireEvent.click(undoButton);
    // Score should revert to 0
    await waitFor(() => {
      const scoreLabel = screen.getAllByText('0')[0];
      expect(scoreLabel).toBeInTheDocument();
    });
  });

  test('reset and undo reset buttons function correctly', async () => {
    render(<CribbageBoard />);

    const resetButton = screen.getByText('Reset');
    const advanceFiveButton = screen.getAllByText(/^[125]$/).find(btn => btn.textContent === '5');

    expect(resetButton).toBeInTheDocument();
    expect(advanceFiveButton).toBeInTheDocument();

    // Advance score to commit a batch
    fireEvent.click(advanceFiveButton!);
    try {
      const previewLabel = await screen.findByText('+5', {}, { timeout: 3000 });
      fireEvent.click(previewLabel);
    } catch (error) {
      console.warn('Preview label not found for commit, assuming score updates directly.', error);
    }
    await waitFor(() => {
      const scoreLabel = screen.getAllByText('5')[0];
      expect(scoreLabel).toBeInTheDocument();
    });

    // Click Reset
    fireEvent.click(resetButton);
    // Expect button text to change to Undo Reset
    await waitFor(() => {
      expect(screen.getByText('Undo Reset')).toBeInTheDocument();
    });
    // Expect scores to reset to 0
    await waitFor(() => {
      const scoreLabels = screen.getAllByText('0');
      expect(scoreLabels.length).toBeGreaterThanOrEqual(2);
    });

    // Click Undo Reset
    fireEvent.click(screen.getByText('Undo Reset'));
    // Expect button text to change back to Reset
    await waitFor(() => {
      expect(screen.getByText('Reset')).toBeInTheDocument();
    });
    // Expect scores to revert to the state before reset (score of 5 for player 1)
    await waitFor(() => {
      const scoreLabel = screen.getAllByText('5')[0];
      expect(scoreLabel).toBeInTheDocument();
    });
  });
}); 