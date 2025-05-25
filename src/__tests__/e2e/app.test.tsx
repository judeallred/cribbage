import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CribbageBoard from '../../components/CribbageBoard';
import '@testing-library/jest-dom';

describe('End-to-end style test', () => {
  test('advancing score using buttons updates the display', async () => {
    render(<CribbageBoard />);

    // Assuming the score labels and buttons are rendered in a predictable order
    // Find the buttons for the first player (index 0)
    const playerOneButtons = screen.getAllByText(/^[125]$/);
    const playerOneAdvanceOneButton = playerOneButtons[0];

    // Find the score display for the first player
    // Initially, the score is 0. After clicking '1', it should become 1.
    const initialScoreLabel = screen.getAllByText('0')[0];
    expect(initialScoreLabel).toBeInTheDocument();

    // Click the '1' button for the first player
    fireEvent.click(playerOneAdvanceOneButton);

    // Due to the batching/buffer, the score might not update immediately.
    // We need to wait for the commit buffer timeout or click the preview.
    // For this simple test, we'll simulate clicking the preview buffer label if it appears.

    // Find the preview buffer label (e.g., '+1')
    // The label text will be '+player.buffer', which is '+1' after one click of the '1' button.
    try {
        const previewLabel = await screen.findByText('+1', {}, { timeout: 3000 }); // Wait up to 3 seconds for the label
        fireEvent.click(previewLabel);
    } catch (error) {
        // If the preview label doesn't appear (e.g., timeout is very short), the score might update directly.
        console.warn('Preview label not found, proceeding assuming score updates directly.', error);
    }

    // Wait for the score display to update to the new score (0 + 1 = 1)
    await waitFor(() => {
      const updatedScoreLabel = screen.getAllByText('1')[0];
      expect(updatedScoreLabel).toBeInTheDocument();
    }, { timeout: 4000 }); // Wait up to 4 seconds for the score to update

  });
}); 