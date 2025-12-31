import './styles/global.scss';
import { Game } from './game/Game';

let game: Game | null = null;

function init(): void {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  // Initialize game
  game = new Game(canvas);

  // Hide loading screen
  hideLoading();

  console.log('Voxel Odyssey initialized!');
  console.log('Controls: WASD move, Space jump, Click shoot');
  console.log('Mobile: Left joystick move, Right button shoot');
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
