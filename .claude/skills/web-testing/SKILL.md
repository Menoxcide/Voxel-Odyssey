---
description: Test and optimize web performance for mobile 60FPS target on Voxel Odyssey
---

# Voxel Odyssey Web Testing Skill

Performance testing and optimization guidance for mobile-first game development.

## Performance Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| FPS | 60 | Never below 30 |
| Draw Calls | <100 | Max 150 |
| Triangles | <50k | Max 100k |
| Memory | <100MB | Max 200MB |
| Load Time | <3s | Max 5s |
| Bundle Size | <5MB | Max 10MB |

## Testing Checklist

### Before Each Phase Completion
- [ ] Run `yarn dev` and test on localhost
- [ ] Chrome DevTools → Performance tab → Record 10 seconds of gameplay
- [ ] Check for frame drops (red bars in timeline)
- [ ] Verify no memory leaks (heap snapshot comparison)
- [ ] Test touch controls on mobile device or emulator

### Mobile Device Testing
```
Required test devices:
- iOS: Safari on iPhone SE (2020) - Low-end baseline
- Android: Chrome on Pixel 4a or Samsung A10

DevTools simulation (minimum):
- Device Mode → iPhone SE
- Throttle CPU: 4x slowdown
- Network: Slow 3G
```

### Performance Profiling Commands
```bash
# Run Lighthouse audit
npx lighthouse http://localhost:5173 --view

# Analyze bundle size
npx vite-bundle-visualizer

# Type checking
yarn tsc --noEmit
```

## Common Performance Issues

### Issue: Frame Rate Drops
**Diagnosis**: Chrome DevTools → Performance → Look for long tasks
**Common Causes**:
1. Too many draw calls → Use InstancedMesh
2. Expensive per-frame allocations → Object pooling
3. Unthrottled event handlers → Add throttle/debounce
4. Complex physics → Reduce body count, use broadphase

### Issue: Memory Leaks
**Diagnosis**: DevTools → Memory → Take heap snapshots before/after gameplay
**Common Causes**:
1. Three.js resources not disposed → Add dispose() methods
2. Event listeners not removed → Clean up in destroy()
3. Circular references → Use WeakMap/WeakRef

### Issue: Slow Initial Load
**Diagnosis**: Network tab → Check bundle sizes
**Fixes**:
1. Tree-shake Three.js imports
2. Lazy load non-critical audio
3. Use Vite code splitting
4. Compress assets with gzip/brotli

## stats.js Integration

Add performance overlay during development:
```typescript
import Stats from 'stats.js';

const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: memory
document.body.appendChild(stats.dom);

function animate() {
  stats.begin();
  // game update/render
  stats.end();
  requestAnimationFrame(animate);
}
```

## Lighthouse Target Scores
```
Performance: >90
Accessibility: >95
Best Practices: >90
PWA: 100 (installable)
```

## Quick Optimization Checklist

- [ ] `antialias: false` on WebGLRenderer
- [ ] InstancedMesh for repeated geometry
- [ ] Object pooling for projectiles/particles
- [ ] Fixed physics timestep (1/60)
- [ ] Touch handlers throttled to 60Hz
- [ ] No textures - vertex colors only
- [ ] LOD for distant objects
- [ ] Frustum culling enabled (default)
