Granular Step-by-Step Task List for Claude Code

Follow these exactly in order. Each step builds incrementally—test frequently (yarn dev → mobile preview). Commit after each major section. Use TypeScript strict mode. Optimize for mobile: requestIdleCallback, throttle inputs, 32x32 voxel chunks.

Phase 1: Project Setup (Steps 1-5)



Initialize Vite + TS Project:

npm create vite@latest voxel-odyssey -- --template vanilla-ts

Install: npm i three cannon-es howler nipplejs vite-plugin-gltf sass @types/three

Setup vite.config.ts: base='/', sourcemap=true, PWA plugin.

Add tsconfig.json: strict=true, target=ES2022.

Create folder structure above. Import Three.js as module.



Base HTML + PWA:

index.html: Fullscreen canvas, DOM overlay div#ui, script src=lib/\*, manifest.json.

manifest.json: name="Voxel Odyssey", icons, mobile scope.

global.scss: Reset, mobile viewport, #canvas {touch-action:none}.



AssetLoader + Preload:

Implement AssetLoader.ts: Promise.all for sounds (Howler), no GLTF yet (procedural).

Test: Console log "Loaded" on init.



InputManager:

Keyboard (WASD/arrows/jump/space/shoot).

Touch: NippleJS left joystick (move), right button (shoot).

Gyro: DeviceOrientation for aiming (requestPermission).

Throttle to 60Hz, mobile-first.



GameLoop + Scene Basics:

GameLoop.ts: RAF, deltaTime, fixed physics step (1/60).

main.ts: Init renderer (WebGL2, antialias=false for perf), camera (perspective 75fov), orbitControls (touch drag).

Add skybox (gradient shader), ambient + directional light.

Test: Spinning cube.





Phase 2: Rendering \& World (Steps 6-12)



VoxelMesh:

InstancedMesh<BoxGeometry> for grass/terrain (greed quadtree chunks).

Custom shader: flat shading, vertex colors (green grass, blue water).



WorldGenerator:

Noise (Simplex via code) for hills (heightmap).

Place cube trees (stem+canopy), water planes.

Arena bounds (invisible walls).

LOD: Far chunks wireframe/low-res.



CharacterModel:

Procedural: Player (dodecahedron head=IcosaGeometry subdiv, cone body, cylinder staff + sphere tip).

Boss: Similar + ears (boxes), tail (tube).

Basic animations: Idle bob, walk cycle (lerp positions), attack windup.



Effects:

ParticleSystem: GPU points for magic trails (blue player, purple boss).

PostProcess: UnrealBloomPass (subtle glow).

Shadows: PCFSoftShadowMap.



Physics:

Cannon-es: World, ground body, player capsule collider.

Gravity, jump impulse, projectile spheres.





Phase 3: Player \& Combat (Steps 11-15)



Player:

Third-person camera follow/lerp.

Move: Velocity damp, jump raycast ground.

Shoot: Raycast aim (reticle), spawn projectile (homing slight).



CombatSystem:

Projectiles: Update pos, collide (sphere-sphere), damage on hit.

Health: 3 hearts, regen timer, i-frames flash.

Particles: Hit sparks, death explode.



Enemy Base:

Minions: Purple orbs, float/sine wave, suicide bomb.

Patrol/chase player.



Boss:

3 Phases: 1=Summon minions/orbs, 2=Beam sweep, 3=Dash+melee.

AI: State machine (FSM), pathfind A\*.

Health bar UI.





Phase 4: UI \& Audio (Steps 16-18)



UIManager:

DOM: Hearts (SVG hearts red/purple), reticle canvas, pause/menu.

Game Over: Retry/Title screen.

Tutorial popups.



AudioManager:

Background loop (ambient voxel chiptune).

SFX: Pool (shoot/hit/explode).

Adaptive volume (mobile vibrate on hit).





Phase 5: Levels \& Polish (Steps 19-25)



Levels:

Level1: Small arena, tutorial minions.

Level2: Larger world, collect gems (powerups: +shot speed).

BossArena: Fog, barriers.



SceneManager:

Fade transitions, progress save (highscore, unlocks).



Enhancements:

Skins: Unlock (green player, etc.) via localStorage.

Leaderboard: Fetch/post to JSON placeholder API.

Colorblind: Toggle shaders.

Perf: Stats.js overlay (hide prod).



Mobile Optimizations:

Pointer lock false, full device orientation.

Low-power mode: Reduce particles far away.

Test on real phone: 60FPS @ low-end.



PWA + Deploy:

Service worker cache.

Build: yarn build → dist/ to Netlify.



Testing Checklist:FeatureTest CasesControlsTouch move/shoot/jump, gyro aimCombatDamage, i-frames, boss phasesPerf60FPS iPhone SE, Android A10AudioMute toggle, loop seamlessSaveProgress persistsLevelsWin conditions, transitions

Final Polish:

Juice: Screen shake, slowmo on big hits.

Win Screen: "Boss Defeated! Next Journey Unlocked."





Claude Instructions: Implement one step at a time. Output full code files per step. Self-review: No console.errors, mobile testable. If stuck, refine prompt with "fix \[issue]". Goal: AAA-feel indie game in <500 LOC core! 🚀

