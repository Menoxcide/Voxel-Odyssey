import './styles/global.scss';
import { Game } from './game/Game';

let game: Game | null = null;

function showError(message: string): void {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: #ff5555;
    padding: 20px;
    border-radius: 10px;
    font-family: monospace;
    z-index: 9999;
    max-width: 80%;
    text-align: center;
  `;
  errorDiv.textContent = `Error: ${message}`;
  document.body.appendChild(errorDiv);
}

function init(): void {
  try {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element not found. Check HTML structure.');
    }

    // Initialize game
    game = new Game(canvas);

    // Hide loading screen
    hideLoading();

    console.log('Voxel Odyssey initialized!');
    console.log('Controls: WASD move, Space jump, Click shoot');
    console.log('Mobile: Left joystick move, Right button shoot');
  } catch (error) {
    console.error('Failed to initialize game:', error);
    showError(error instanceof Error ? error.message : 'Unknown initialization error');

    // Hide loading screen even on error
    hideLoading();
  }
}

function hideLoading(): void {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 300);
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (game) {
    game.dispose();
  }
});

// Start when DOM ready
document.addEventListener('DOMContentLoaded', init);
