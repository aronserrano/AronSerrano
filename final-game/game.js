// --- Canvas Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const TILE_SIZE = 40;

// **FIXED:** Map dimensions calculated AFTER map is defined
let MAP_WIDTH_TILES = 0;
let MAP_HEIGHT_TILES = 0;


// --- Game State ---
let gameState = 'menu'; // Start at menu: 'menu', 'explore', 'combat', 'dialogue', 'gameOver'
let player;
let npcs = [];
let enemies = [];
let quests = {};
let currentDialogue = null;
let currentCombat = { // Encapsulate combat state
    active: false,
    enemy: null,
    turn: 'player',
    playerDefending: false,
};
let messageLog = document.getElementById('messageLog'); // Gets assigned later if initially hidden
let activeEffects = []; // For floating text, flashes, etc.

// --- Analytics Data (Structure remains) ---
let analytics = {
    startTimeSession: Date.now(),
    timePlayedSession: 0,
    timePlayedTotal: 0,
    questsCompletedCount: 0,
    questsAcceptedCount: 0,
    enemiesDefeatedCount: 0,
    combatWins: 0,
    combatLosses: 0,
    potionsUsed: 0,
    damageDealtTotal: 0,
    damageTakenTotal: 0,
    lastAreaVisited: 'Havenwood',
};

// --- Game Data ---
const map = [ // 0: grass, 1: wall, 2: NPC, 3: Enemy, 4: Quest Item, 5: Stronger Enemy
    // 15 columns wide
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 2, 0, 0, 1, 0, 4, 0, 1, 1, 1, 0, 0, 1], // NPC at (2,2), Item at (7,2)
    [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 3, 1, 0, 0, 1], // Enemy at (10,3)
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1, 5, 1], // Stronger enemy at (13,5)
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 1], // Enemy at (7,8)
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 10 rows high
];

// **FIXED:** Calculate dimensions correctly AFTER map definition
MAP_WIDTH_TILES = map[0].length;
MAP_HEIGHT_TILES = map.length;

const TILE_COLORS = {
    0: '#5dac5d', // Grass
    1: '#808080', // Wall
    4: '#FFFF00', // Quest Item (temp color)
    // Colors for entities are handled in drawEntities
};

// --- Helper Functions ---

// Enhanced logMessage - Needs CSS from previous step for styling classes
function logMessage(msg, type = 'info') { // Default type 'info' (uses accent color)
    // Get messageLog element *after* DOM is loaded and it's visible
    if (!messageLog) messageLog = document.getElementById('messageLog');

    if (messageLog) {
        messageLog.textContent = msg;

        // Reset class list to base + new type
        messageLog.className = 'message-log'; // Base class
        messageLog.classList.add(type); // Add the specified type class

    } else if (gameState !== 'menu') { // Only warn if not in menu state
        console.warn("messageLog element not found!");
    }

     // Force browser reflow (optional, uncomment if animations need restarting)
     // messageLog.style.animation = 'none';
     // messageLog.offsetHeight; /* trigger reflow */
     // messageLog.style.animation = null;
}


function updateUI() {
    // Don't try to update UI if the player doesn't exist or game hasn't started
    if (!player || gameState === 'menu') return;

    // Ensure messageLog is assigned (it might become available after menu disappears)
    if (!messageLog) messageLog = document.getElementById('messageLog');

    // Helper function to safely update text content
    const updateElementText = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        } else {
             // Optional: Warn if an element is unexpectedly missing during gameplay
              console.warn(`UI element with ID '${id}' not found during updateUI.`);
        }
    };

    updateElementText('playerLevel', player.level);
    updateElementText('playerHP', player.hp);
    updateElementText('playerMaxHP', player.maxHp);
    updateElementText('playerMP', player.mp);
    updateElementText('playerMaxMP', player.maxMp);
    updateElementText('playerDefense', player.defense);
    updateElementText('playerXP', player.xp);
    updateElementText('xpToNextLevel', player.xpToNextLevel);
    updateElementText('playerAttack', player.attackPower);
    updateElementText('playerPotions', player.potions);


    // Update Quest List UI
    const questListElement = document.getElementById('questList');
    if (questListElement) {
        questListElement.innerHTML = ''; // Clear old list
        Object.values(quests).forEach(q => {
            if (q.status !== 'not started') {
                const li = document.createElement('li');
                let progressText = q.target > 0 ? ` (${q.progress}/${q.target})` : '';
                li.textContent = `${q.title}: ${q.description}${progressText}`;

                // Reset classes before applying new one
                li.className = ''; // Clear existing classes like 'completed' or 'ready-to-complete'

                if (q.status === 'can complete') {
                    li.textContent += ' [Ready]';
                    li.classList.add('ready-to-complete'); // Use class for styling readiness
                } else if (q.status === 'completed') {
                    li.classList.add('completed');
                }
                // Add class for 'active' state if desired for styling
                else if (q.status === 'active') {
                     li.classList.add('active'); // Example class for active quests
                }
                questListElement.appendChild(li);
            }
        });
    } else {
         console.warn("Quest list element not found during updateUI.");
    }

    // Update Analytics UI
    analytics.timePlayedSession = Math.floor((Date.now() - analytics.startTimeSession) / 1000);
    updateElementText('timePlayedSession', analytics.timePlayedSession);
    updateElementText('timePlayedTotal', Math.floor(analytics.timePlayedTotal / 1000));
    updateElementText('questsCompleted', analytics.questsCompletedCount);
    updateElementText('enemiesDefeated', analytics.enemiesDefeatedCount);
    updateElementText('combatWins', analytics.combatWins);
    updateElementText('combatLosses', analytics.combatLosses);
    updateElementText('potionsUsed', analytics.potionsUsed);
}

function isWalkable(x, y) {
    // Check bounds using the calculated map dimensions
    if (x < 0 || x >= MAP_WIDTH_TILES || y < 0 || y >= MAP_HEIGHT_TILES) {
        return false; // Out of bounds
    }
    // Check tile type from the map array
    const tileType = map[y][x];
    // Add any other non-walkable tiles here if needed (e.g., water, lava)
    return tileType !== 1; // Can walk on anything that's not a wall (tile 1)
}

function getEntityAt(x, y) {
    // Check NPCs first
    for (const npc of npcs) {
        if (npc.x === x && npc.y === y) return npc;
    }
    // Check Enemies (only alive ones for interaction/collision)
    for (const enemy of enemies) {
        // **FIXED:** Check hp > 0 correctly
        if (enemy.hp > 0 && enemy.x === x && enemy.y === y) return enemy;
    }
    return null; // No entity found at these coordinates
}

// --- Visual Effects ---
function addEffect(effect) {
    // effect = { type: 'damageNumber'/'levelFlash', x, y, text, duration, color, startTime }
    effect.startTime = performance.now();
    activeEffects.push(effect);
}

function updateEffects(currentTime) {
    // Filter out expired effects
    activeEffects = activeEffects.filter(effect => {
        const elapsed = currentTime - effect.startTime;
        return elapsed < effect.duration;
    });
}


function drawEffects() {
    const currentTime = performance.now();
    activeEffects.forEach(effect => {
        const elapsed = currentTime - effect.startTime;
        const progress = Math.min(1.0, elapsed / effect.duration); // Clamp progress to 1

        ctx.save(); // Save context state before drawing effect

        if (effect.type === 'damageNumber') {
            ctx.font = 'bold 18px Poppins, sans-serif'; // Use game font
            ctx.fillStyle = effect.color || 'red';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;

            // Make text float up and fade out
            const floatY = effect.y - (progress * 25); // Float up more
            ctx.globalAlpha = 1.0 - progress; // Fade out smoothly

            ctx.textAlign = 'center';
            ctx.fillText(effect.text, effect.x, floatY);

        } else if (effect.type === 'levelFlash') {
            // Flash effect: quick fade in/out overlay
            const alpha = Math.sin(progress * Math.PI); // Sine wave for smooth flash (peak at 50% duration)
            ctx.fillStyle = `rgba(255, 255, 150, ${alpha * 0.6})`; // Yellowish flash, slightly less opaque
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        // Add other effect types here (e.g., heal flash, status effect icon)

        ctx.restore(); // Restore context state
    });
     // Ensure globalAlpha is reset if not done by restore() - though restore() should handle it
     // ctx.globalAlpha = 1.0;
}


// --- Player Class ---
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.hp = 20; // Increased base HP
        this.maxHp = 20;
        this.mp = 10; // Added Mana
        this.maxMp = 10;
        this.xp = 0;
        this.level = 1;
        this.xpToNextLevel = 100;
        this.attackPower = 3; // Base attack
        this.magicPower = 5; // Base magic attack
        this.defense = 1;    // Base defense
        this.potions = 2;
        this.questItems = {}; // For holding items like Blightroot if needed later
    }

    move(dx, dy) {
        if (gameState !== 'explore') return;

        const newX = this.x + dx;
        const newY = this.y + dy;

        // Check for collision with entities *before* checking walkability
        const entity = getEntityAt(newX, newY);
        if (entity && entity.type === 'enemy') {
            startCombat(entity);
            return; // Don't move into enemy tile
        }

        // Check if the target tile itself is walkable (e.g., not a wall)
        if (isWalkable(newX, newY)) {
             // Check again for non-enemy entities at the destination (e.g., NPCs - prevent walking into them)
             const destinationEntity = getEntityAt(newX, newY);
             if (!destinationEntity) { // Only move if the destination tile is walkable AND empty
                 this.x = newX;
                 this.y = newY;
                 checkForQuestItem(this.x, this.y); // Check for items after moving
             } else {
                  // Optional: Log message if blocked by NPC
                  // logMessage(`Blocked by ${destinationEntity.name}.`, 'info');
             }
        }
    }

    interact() {
        if (gameState !== 'explore') return;
        // Check adjacent tiles and current tile for interactable entities/items
        const directions = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]; // Include current tile [0,0]
        let interacted = false;

        for (const [dx, dy] of directions) {
            const checkX = this.x + dx;
            const checkY = this.y + dy;

            // Check bounds first
            if (checkX < 0 || checkX >= MAP_WIDTH_TILES || checkY < 0 || checkY >= MAP_HEIGHT_TILES) {
                continue;
            }

            const entity = getEntityAt(checkX, checkY);

            // Interact with NPC
            if (entity && entity.type === 'npc') {
                startDialogue(entity);
                interacted = true;
                break; // Interact with the first NPC found
            }

            // Interact with quest item on the ground (only if standing on it)
            if (dx === 0 && dy === 0 && map[checkY] && map[checkY][checkX] === 4) {
                 checkForQuestItem(checkX, checkY); // Attempt to pick up
                 interacted = true; // Consider seeing it as interaction
                 break; // Prioritize picking up item on current tile
            }
        }

         if (!interacted) logMessage("Nothing interesting nearby.", "info");
    }


    addXP(amount) {
        if (amount <= 0) return; // Avoid unnecessary updates for 0 XP

        this.xp += amount;
        logMessage(`Gained ${amount} XP!`, "success");
        let leveledUp = false; // Flag to check if level up occurred
        while (this.xp >= this.xpToNextLevel) { // Allow multi-level up
            this.levelUp();
            leveledUp = true;
        }
        // Only update UI if XP changed or leveled up
        // (Already updated inside levelUp if that happened, so this catches XP gain without level up)
        if (!leveledUp) {
             updateUI();
        }
    }

    levelUp() {
        this.level++;
        this.xp -= this.xpToNextLevel; // Subtract threshold for the level just completed
        this.xpToNextLevel = Math.floor(this.xpToNextLevel * 1.5); // Increase threshold for the *next* level
        this.maxHp += 5;
        this.maxMp += 3; // Increase max MP
        this.attackPower += 1;
        this.magicPower += 2; // Increase magic power
        this.defense += 1;    // Increase defense
        // Full heal/restore on level up
        this.hp = this.maxHp;
        this.mp = this.maxMp;
        logMessage(`Level Up! Reached Level ${this.level}! Stats increased!`, "success");
        addEffect({ type: 'levelFlash', duration: 600 }); // Add level up flash effect (longer duration)
        updateUI(); // Update UI immediately after level up
    }

    usePotion() {
        if (this.potions > 0 && this.hp < this.maxHp) {
            this.potions--;
            const healAmount = Math.min(this.maxHp - this.hp, 15); // Heal up to 15 HP or to full
            this.hp += healAmount;
            logMessage(`Used a potion. Healed ${healAmount} HP.`, "success");

            // Position effect based on game state
            const effectX = gameState === 'combat' ? 80 + (TILE_SIZE * 1.5) / 2 : this.x * TILE_SIZE + TILE_SIZE / 2; // Center on combat sprite or map tile
            const effectY = gameState === 'combat' ? 150 : this.y * TILE_SIZE; // Near combat sprite head or top of map tile
            addEffect({ type: 'damageNumber', x: effectX, y: effectY, text: `+${healAmount}`, duration: 1200, color: 'lime' }); // Longer duration for heals

            analytics.potionsUsed++;
            updateUI();
            return true;
        } else if (this.potions <= 0) {
            logMessage("No potions left!", "warning");
            return false;
        } else {
            logMessage("HP is already full.", "info");
            return false;
        }
    }

    // Take damage, considering defense and defend status
    takeDamage(amount, isMagic = false) {
        let damageTaken = amount;
        if (!isMagic) { // Physical damage considers defense
            damageTaken = Math.max(1, amount - this.defense); // Apply defense, min 1 damage
            if (currentCombat.active && currentCombat.playerDefending) { // Check if in combat and defending
                damageTaken = Math.max(1, Math.floor(damageTaken * 0.5)); // Halve damage after defense, min 1
                 // Don't log softened blow here, maybe enemy turn handles it
            }
        } else {
             // Magic damage currently ignores defense (adjust if needed)
             damageTaken = Math.max(1, amount); // Min 1 damage
         }

        this.hp -= damageTaken;
        analytics.damageTakenTotal += damageTaken;

        // Add damage number effect at player's location (adjust for combat screen)
        const effectX = gameState === 'combat' ? 80 + (TILE_SIZE * 1.5) / 2 : this.x * TILE_SIZE + TILE_SIZE / 2; // Center on combat sprite or map tile
        const effectY = gameState === 'combat' ? 150 : this.y * TILE_SIZE; // Near combat sprite head or top of map tile
        addEffect({ type: 'damageNumber', x: effectX, y: effectY, text: `${damageTaken}`, duration: 1000, color: 'red' });

        // Log damage taken *after* applying it
        // Log message moved to enemyTurn or handleCombatInput for context

        if (this.hp <= 0) {
            this.hp = 0;
            updateUI(); // Update UI to show 0 HP before triggering game over
            handlePlayerDefeat(); // Triggers game over state
        } else {
            updateUI(); // Update HP bar immediately if not defeated
        }
        // Return damage taken in case caller needs it
        return damageTaken;
    }

    canCastSpell(cost) {
        return this.mp >= cost;
    }

    spendMana(cost) {
        if (this.canCastSpell(cost)) {
            this.mp -= cost;
            updateUI();
            return true;
        }
        return false;
    }
}


// --- NPC Class ---
class NPC {
    constructor(x, y, name, dialogueOptions, givesQuest = null) {
        this.x = x;
        this.y = y;
        this.name = name;
        this.dialogueOptions = dialogueOptions; // { initial, questActive, questReady, questComplete }
        this.givesQuest = givesQuest; // Quest ID string or null
        this.type = 'npc';
    }

    getDialogue() {
        const questId = this.givesQuest;
        // Check if this NPC gives a quest and the quest exists
        if (questId && quests[questId]) {
            const quest = quests[questId];
            // Return specific dialogue based on quest status
            if (quest.status === 'completed' && this.dialogueOptions.questComplete) {
                return this.dialogueOptions.questComplete;
            }
            if (quest.status === 'can complete' && this.dialogueOptions.questReady) {
                return this.dialogueOptions.questReady;
            }
            if (quest.status === 'active' && this.dialogueOptions.questActive) {
                return this.dialogueOptions.questActive;
            }
            // If quest is 'not started', fall through to initial dialogue which should offer it
        }
        // Default dialogue if no quest or no specific state dialogue defined
        return this.dialogueOptions.initial;
    }

    offerQuest() {
         const questId = this.givesQuest;
         if (questId && quests[questId]) {
             const quest = quests[questId];
             if (quest.status === 'not started') {
                 acceptQuest(questId); // Function to change quest status to active
             } else if (quest.status === 'can complete') {
                 completeQuest(questId); // Function to complete the quest
             } else if (quest.status === 'active') {
                 // Provide feedback if the quest is active but not ready
                 logMessage(`${this.name}: ${this.dialogueOptions.questActive || 'Keep working on the task!'}`, 'info');
             } else if (quest.status === 'completed') {
                 // Provide feedback if the quest is already done
                 logMessage(`${this.name}: ${this.dialogueOptions.questComplete || 'Thank you again for your help!'}`, 'info');
             }
         } else {
             // Message if trying to interact quest-wise but NPC has no quest
              logMessage(`${this.name}: Anything else?`, 'info');
         }
    }
}


// --- Enemy Class ---
class Enemy {
    constructor(x, y, name, hp, attack, defense, xpReward, drops = null) { // Added defense and drops
        this.x = x;
        this.y = y;
        this.name = name;
        this.hp = hp;
        this.maxHp = hp;
        this.attackPower = attack;
        this.defense = defense; // Enemy defense
        this.xpReward = xpReward;
        this.drops = drops; // e.g., { item: 'potion', chance: 0.3 } or null
        this.type = 'enemy';
    }

    takeDamage(amount, isMagic = false) {
        let damageTaken = amount;
        if (!isMagic) { // Apply defense against physical damage
             damageTaken = Math.max(1, amount - this.defense); // Min 1 damage after defense
        } else {
             // Magic damage interaction - currently bypasses defense
             damageTaken = Math.max(1, amount); // Min 1 damage
         }

        this.hp -= damageTaken;
        if (this.hp < 0) this.hp = 0;

        // Add damage number effect (adjust position for combat screen)
        const effectX = gameState === 'combat' ? canvas.width - 80 - (TILE_SIZE * 1.5 / 2) : this.x * TILE_SIZE + TILE_SIZE / 2; // Center on combat sprite or map tile
        const effectY = gameState === 'combat' ? 150 : this.y * TILE_SIZE; // Near combat sprite head or top of map tile
        addEffect({ type: 'damageNumber', x: effectX, y: effectY, text: `${damageTaken}`, duration: 1000, color: '#f0f0f0' }); // Light grey/white for enemy damage taken

        // Update combat UI immediately if in combat
        if (currentCombat.active) updateCombatUI();

        return damageTaken; // Return damage dealt for logging/analytics
    }
}

// --- Quest System ---
class Quest {
    constructor(id, title, description, target, rewardXP, itemReward = null) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.target = target; // Number of items/kills needed (0 if just interaction)
        this.progress = 0;
        this.rewardXP = rewardXP;
        this.itemReward = itemReward; // e.g., { type: 'potion', amount: 1 } or null
        this.status = 'not started'; // 'not started', 'active', 'can complete', 'completed'
    }
}

function acceptQuest(id) {
    if (quests[id] && quests[id].status === 'not started') {
        quests[id].status = 'active';
        logMessage(`Quest accepted: ${quests[id].title}`, "success");
        analytics.questsAcceptedCount++;
        updateUI(); // Refresh quest list
    }
}

function checkForQuestItem(x, y) {
     // Check if the tile exists and is a quest item tile (4)
     if (y >= 0 && y < MAP_HEIGHT_TILES && x >= 0 && x < MAP_WIDTH_TILES && map[y][x] === 4) {
        const blightrootQuest = quests['fetchBlightroot']; // Assuming quest ID is 'fetchBlightroot'

        // Check if the quest exists and is currently active
        if (blightrootQuest && blightrootQuest.status === 'active') {
            map[y][x] = 0; // Change tile to grass visually (runtime only - lost on refresh!)
            blightrootQuest.progress++;
            logMessage(`Collected Blightroot (${blightrootQuest.progress}/${blightrootQuest.target})!`, 'info');
            // Check if this collection completes the objective
            checkQuestCompletion(blightrootQuest);
             updateUI(); // Update UI to show progress change
        } else {
             // Player sees the item but doesn't have the quest active
             logMessage("You see some strange, pulsating roots.", 'info');
         }
    }
}


function checkQuestCompletion(quest) {
     // Check if quest is active and progress meets or exceeds target
     if (quest.status === 'active' && quest.progress >= quest.target) {
         // Mark as ready to turn in (requires returning to NPC)
         quest.status = 'can complete';
         logMessage(`Objective complete for '${quest.title}'! Return to the quest giver.`, "warning");
         // Update UI to show the 'Ready' status
          updateUI();
     }
}

function completeQuest(id) {
     const quest = quests[id];
     // Can only complete if the status is 'can complete' (objective met, player at NPC)
    if (quest && quest.status === 'can complete') {
        quest.status = 'completed';

        let rewardMsg = '';
        if (quest.itemReward) {
            // Handle specific item rewards
            if (quest.itemReward.type === 'potion') {
                player.potions += quest.itemReward.amount;
                rewardMsg = ` You received ${quest.itemReward.amount} potion(s).`;
            }
            // Add other item types here (e.g., gold, equipment)
            // else if (quest.itemReward.type === 'gold') { player.gold += quest.itemReward.amount; ... }
        }

        // Log completion message FIRST
        logMessage(`Quest Complete: ${quest.title}!${rewardMsg}`, "success");
        // Then grant XP (which might trigger level up log and UI update)
        player.addXP(quest.rewardXP);

        analytics.questsCompletedCount++;
        // UI should be updated by addXP or subsequent levelUp call.
        // Call updateUI() again just to ensure potion count is reflected if addXP didn't level up.
        updateUI();
    } else if (quest && quest.status === 'active') {
        // Player tried to turn in too early
        logMessage(`You haven't finished the task for '${quest.title}' yet.`, "info");
    } else if (quest && quest.status === 'completed') {
         // Player talks to NPC after already completing
         logMessage(`You already completed '${quest.title}'.`, "info");
     }
     // No action if quest is 'not started' or doesn't exist
}


// --- Dialogue System ---
function startDialogue(npc) {
    if (gameState === 'combat') return; // Don't start dialogue during combat

    gameState = 'dialogue';
    currentDialogue = npc;
    const text = npc.getDialogue(); // Get context-specific dialogue line

    // Determine quest prompt based on current quest status
    let questPrompt = "";
    const questId = npc.givesQuest;
    if (questId && quests[questId]) {
        const qStatus = quests[questId].status;
        if (qStatus === 'not started') {
            questPrompt = " [Q: Accept Quest]";
        } else if (qStatus === 'can complete') {
            questPrompt = " [Q: Complete Quest]";
        }
        // No prompt needed if quest is active or completed, Q will just get default feedback
    }

    logMessage(`${npc.name}: "${text}" (E: Close${questPrompt})`, 'info'); // Removed newline, use CSS for spacing
    draw(); // Redraw to potentially show dialogue overlay/dimming
}

function handleDialogueInput(key) {
    // Ensure we are in dialogue state and have a current NPC
    if (gameState !== 'dialogue' || !currentDialogue) {
        endDialogue(); // Safety exit if state is wrong
        return;
    }

    const lowerKey = key.toLowerCase(); // Normalize key

    if (lowerKey === 'e') {
        endDialogue();
    } else if (lowerKey === 'q') {
        // Attempt to progress the quest (accept/complete)
        currentDialogue.offerQuest();
        // Refresh the dialogue display AFTER the quest action, in case status/dialogue changed
        const updatedText = currentDialogue.getDialogue();
        let questPrompt = ""; // Re-evaluate prompt
        const questId = currentDialogue.givesQuest;
         if (questId && quests[questId]) {
            const qStatus = quests[questId].status;
            if (qStatus === 'not started') questPrompt = " [Q: Accept Quest]";
            else if (qStatus === 'can complete') questPrompt = " [Q: Complete Quest]";
        }
         // Log the potentially updated message
         logMessage(`${currentDialogue.name}: "${updatedText}" (E: Close${questPrompt})`, 'info');
    }
}

function endDialogue() {
    if (gameState === 'dialogue') { // Only change state if currently in dialogue
        gameState = 'explore';
        currentDialogue = null;
        logMessage("Exploring...", "info"); // Give feedback
        updateUI(); // Ensure UI is up-to-date
        draw(); // Redraw the exploration view
    }
}

// --- Combat System ---
function startCombat(enemy) {
    // Prevent starting combat if already in one, enemy is dead, or game is not in explore state
    if (!enemy || enemy.hp <= 0 || gameState !== 'explore') return;

    gameState = 'combat';
    currentCombat.active = true;
    currentCombat.enemy = enemy;
    currentCombat.turn = 'player'; // Player always starts
    currentCombat.playerDefending = false; // Reset defend status
    logMessage(`Engaged ${enemy.name}!`, 'combat');

    // Initial draw of combat screen BEFORE prompting action
    draw();
    // Now prompt the player
    promptPlayerAction();
}

function promptPlayerAction() {
     // Check if it's actually the player's turn and combat is active
     if (gameState === 'combat' && currentCombat.active && currentCombat.turn === 'player') {
         const magicCost = 3; // Make cost visible
         logMessage(`Your turn! [A]ttack | [M]agic (${player.magicPower} DMG/${magicCost}MP) | [P]otion (${player.potions}) | [D]efend`, 'combat');
     }
}

function handleCombatInput(key) {
    // Ignore input if not player's turn or not in combat
    if (!currentCombat.active || currentCombat.turn !== 'player' || gameState !== 'combat') return;

    let playerActionTaken = false;
    const enemy = currentCombat.enemy;
    const magicCost = 3;
    const lowerKey = key.toLowerCase();

    // Reset defend status at the start of player's action selection
    // It will be set again *if* they choose Defend.
    currentCombat.playerDefending = false;

    switch (lowerKey) {
        case 'a': // Attack
            const damageDealtPhysical = enemy.takeDamage(player.attackPower, false); // Physical damage
            analytics.damageDealtTotal += damageDealtPhysical;
            logMessage(`You attack ${enemy.name} for ${damageDealtPhysical} physical damage.`, 'combat');
            playerActionTaken = true;
            break;

        case 'm': // Magic
            if (player.canCastSpell(magicCost)) {
                if(player.spendMana(magicCost)) { // Spend Mana only if successful
                    const damageDealtMagic = enemy.takeDamage(player.magicPower, true); // Magic damage
                    analytics.damageDealtTotal += damageDealtMagic;
                    logMessage(`You blast ${enemy.name} for ${damageDealtMagic} magic damage.`, 'combat');
                    playerActionTaken = true;
                } else {
                     // This case should ideally not happen if canCastSpell is checked first
                     console.error("Error: Could not spend mana even though canCastSpell was true.");
                 }
            } else {
                logMessage(`Not enough MP (Need ${magicCost}, have ${player.mp})!`, 'warning');
                // Player didn't take a valid action, prompt again
                promptPlayerAction();
            }
            break;

        case 'p': // Potion
            if (player.usePotion()) { // usePotion handles logging and UI update
                playerActionTaken = true; // Using a potion counts as a turn
            } else {
                 // Potion failed (no potions / full health), player can choose another action
                 promptPlayerAction();
             }
            break;

        case 'd': // Defend
            currentCombat.playerDefending = true; // Set defend flag for the enemy's upcoming turn
            logMessage("You brace yourself, increasing defense!", 'combat');
            playerActionTaken = true;
            break;

        default:
            // Invalid key pressed during player turn
            logMessage("Invalid action. Keys: [A], [M], [P], [D]", 'warning');
            promptPlayerAction(); // Re-prompt
            break;
    }

    // If a valid action resulting in a turn end was taken
    if (playerActionTaken) {
        updateCombatUI(); // Update UI immediately after action (e.g., enemy HP change)
         if (enemy.hp <= 0) {
            // Enemy defeated
            winCombat(); // Handle win logic (ends turn implicitly)
        } else {
            // Enemy survived, proceed to enemy's turn
            endPlayerTurn();
        }
    }
    // If action was invalid or didn't end turn (e.g., not enough MP), promptPlayerAction was called inside the case
}


function endPlayerTurn() {
    if (!currentCombat.active || gameState !== 'combat') return; // Safety check

    currentCombat.turn = 'enemy';
    updateCombatUI(); // Redraw screen to show it's enemy's turn
    logMessage(`${currentCombat.enemy.name}'s turn...`, 'combat');

    // Add a delay before the enemy acts for better pacing
    setTimeout(enemyTurn, 1100); // Slightly longer delay (1.1 seconds)
}

function enemyTurn() {
    // Make sure combat is still active and it's the enemy's turn
    if (!currentCombat.active || currentCombat.turn !== 'enemy' || gameState !== 'combat') return;

    const enemy = currentCombat.enemy;
    // Ensure enemy is still alive
    if (enemy.hp <= 0) {
        console.warn("Enemy turn called but enemy is already defeated.");
        endCombat();
        return;
    }

    // --- Simple Enemy AI: Just Attack ---
    const damage = enemy.attackPower;
    logMessage(`${enemy.name} attacks!`, 'combat'); // Announce attack first
    // Player takes damage - takeDamage returns actual damage dealt
    const actualDamageTaken = player.takeDamage(damage, false);
    // Log the result (damage amount logged by takeDamage effect now)
    // Optional: Log context like "You take X damage." here if preferred over effect text only
     if (currentCombat.active && currentCombat.playerDefending) { // Log if defense was active *during* this attack
         logMessage(`Your defense softened the blow! Took ${actualDamageTaken} damage.`, "combat");
     }


    // Player's takeDamage function handles HP reduction, effects, logging, and defeat check.

    // If the player was defeated, handlePlayerDefeat() will transition gameState, stopping further combat flow.
    // If player survived:
    if (gameState === 'combat') { // Check if player defeat didn't change the state
         currentCombat.turn = 'player';
         updateCombatUI(); // Refresh UI for player's turn
         promptPlayerAction(); // Prompt player for their next action
    }
}

// Ends combat generically (used by win/loss/flee)
function endCombat() {
    const wasInCombat = gameState === 'combat'; // Check if we were actually in combat

    gameState = 'explore';
    currentCombat.active = false;
    currentCombat.enemy = null;
    currentCombat.playerDefending = false; // Reset defend status

    if (wasInCombat) { // Only redraw and update UI if transitioning out of combat
        draw(); // Redraw exploration map
        updateUI();
        logMessage("Exploring...", "info"); // General message after combat ends
    }
}


function winCombat() {
    if (!currentCombat.active) return; // Prevent double wins

    const enemy = currentCombat.enemy;
    logMessage(`Defeated ${enemy.name}!`, "success");
    analytics.enemiesDefeatedCount++;
    analytics.combatWins++;

    // Handle drops BEFORE ending combat state
    if (enemy.drops && Math.random() < enemy.drops.chance) {
        if (enemy.drops.item === 'potion') {
            player.potions++;
            logMessage(`The ${enemy.name} dropped a potion!`, 'success');
            // UI will update after XP gain
        }
    }

     // Grant XP last, as it might trigger level up logs/UI updates
     player.addXP(enemy.xpReward);

    // Mark enemy as defeated (hp already 0)
    enemy.hp = 0; // Ensure HP is 0

    // End combat state and return to exploration
    endCombat(); // Use the generic endCombat function
}

function handlePlayerDefeat() {
    // Only trigger once
    if (gameState === 'gameOver') return;

    logMessage("You have been defeated! GAME OVER.", "error");
    analytics.combatLosses++;
    gameState = 'gameOver';
    saveAnalytics(); // Save final stats

    // Stop background music if playing
    const bgMusic = document.getElementById("bgMusic");
    if (bgMusic) bgMusic.pause();


    // Draw game over screen immediately - no more game loop calls after this
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; // Darker overlay
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'red';
    ctx.font = 'bold 44px Poppins, sans-serif'; // Larger font
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 6;
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40); // Adjusted position

     ctx.font = '18px Poppins, sans-serif';
     ctx.fillStyle = '#cccccc'; // Light grey for subtext
     ctx.shadowBlur = 3;
     ctx.fillText('Refresh the page (Ctrl+R or F5) to restart.', canvas.width / 2, canvas.height / 2 + 30); // Adjusted position
}

// --- Analytics Persistence (Basic - uses localStorage) ---
function saveAnalytics() {
    let sessionDurationToAdd = 0;
    // Calculate duration only if game isn't already over
    if (gameState !== 'gameOver') {
        sessionDurationToAdd = Math.floor((Date.now() - analytics.startTimeSession) / 1000);
        analytics.startTimeSession = Date.now(); // Reset session timer for the *next* interval
    }
    // Add the calculated duration (might be 0 if game over)
    analytics.timePlayedTotal += sessionDurationToAdd;

    try {
        // Filter out NaN or excessively large values before saving
        const sanitizedAnalytics = { ...analytics };
        if (isNaN(sanitizedAnalytics.timePlayedTotal) || !isFinite(sanitizedAnalytics.timePlayedTotal)) {
            sanitizedAnalytics.timePlayedTotal = 0; // Reset if invalid
            console.warn("Corrected invalid timePlayedTotal before saving analytics.");
        }
        // Add checks for other numeric values if needed

        localStorage.setItem('emberstoneAnalytics', JSON.stringify(sanitizedAnalytics));
        // console.log("Analytics saved."); // Optional: confirmation log
    } catch (e) {
        console.error("Failed to save analytics to localStorage:", e);
    }
}

function loadAnalytics() {
    try {
        const savedData = localStorage.getItem('emberstoneAnalytics');
        if (savedData) {
            const loadedAnalytics = JSON.parse(savedData);
            // Merge loaded data carefully, providing defaults and validating numbers
            analytics.timePlayedTotal = (Number(loadedAnalytics.timePlayedTotal) >= 0 && isFinite(loadedAnalytics.timePlayedTotal)) ? Number(loadedAnalytics.timePlayedTotal) : 0;
            analytics.questsCompletedCount = Number(loadedAnalytics.questsCompletedCount) || 0;
            analytics.questsAcceptedCount = Number(loadedAnalytics.questsAcceptedCount) || 0;
            analytics.enemiesDefeatedCount = Number(loadedAnalytics.enemiesDefeatedCount) || 0;
            analytics.combatWins = Number(loadedAnalytics.combatWins) || 0;
            analytics.combatLosses = Number(loadedAnalytics.combatLosses) || 0;
            analytics.potionsUsed = Number(loadedAnalytics.potionsUsed) || 0;
            analytics.damageDealtTotal = Number(loadedAnalytics.damageDealtTotal) || 0;
            analytics.damageTakenTotal = Number(loadedAnalytics.damageTakenTotal) || 0;
            analytics.lastAreaVisited = loadedAnalytics.lastAreaVisited || 'Havenwood'; // Default area
            console.log("Analytics loaded.");
        } else {
             console.log("No saved analytics found. Initializing defaults.");
             // Ensure defaults are set if nothing is loaded
             analytics.timePlayedTotal = 0;
             // Other counts default to 0 from initial object definition
        }
    } catch (e) {
        console.error("Failed to load or parse analytics:", e);
         // Reset crucial stats if loading fails
         analytics.timePlayedTotal = 0;
    }
    // Always reset session timer on game start/load
    analytics.startTimeSession = Date.now();
}


// --- Rendering ---
function drawMap() {
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
        for (let x = 0; x < MAP_WIDTH_TILES; x++) {
             // No need to check bounds here if loops use MAP_HEIGHT_TILES/MAP_WIDTH_TILES correctly
            const tileType = map[y][x];
            ctx.fillStyle = TILE_COLORS[tileType] || TILE_COLORS[0]; // Fallback to grass color

            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

            // Optional: Subtle grid for development
            // ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            // ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }
}

function drawEntities() {
    // Draw Player
    if (player) {
        ctx.fillStyle = '#3498db'; // Player color
        ctx.fillRect(player.x * TILE_SIZE, player.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        // Add subtle border/detail
        ctx.strokeStyle = '#2980b9';
        ctx.lineWidth = 1;
        ctx.strokeRect(player.x * TILE_SIZE + 1, player.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }

    // Draw NPCs
    ctx.fillStyle = '#2ecc71'; // NPC color
    ctx.strokeStyle = '#27ae60'; // NPC border
    ctx.lineWidth = 1;
    npcs.forEach(npc => {
        ctx.fillRect(npc.x * TILE_SIZE, npc.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.strokeRect(npc.x * TILE_SIZE + 1, npc.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    });

    // Draw Enemies (only if alive)
    enemies.forEach(enemy => {
        if (enemy.hp > 0) {
             // Differentiate enemy types by color
             let fillColor, strokeColor;
             if (enemy.name === "Cave Troll") {
                 fillColor = '#c0392b'; // Darker red for stronger enemy
                 strokeColor = '#a03020';
             } else { // Blight Bat
                 fillColor = '#e74c3c'; // Standard red for weaker enemy
                 strokeColor = '#c0392b';
             }
            ctx.fillStyle = fillColor;
            ctx.fillRect(enemy.x * TILE_SIZE, enemy.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(enemy.x * TILE_SIZE + 1, enemy.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
    });
}

// --- Combat Screen Drawing ---
function drawCombatScreen() {
    // Background overlay
    ctx.fillStyle = 'rgba(22, 33, 62, 0.92)'; // Dark blueish overlay, slightly more opaque
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- Draw Player representation/stats ---
    if (player) {
        ctx.fillStyle = '#e0e0e0'; // Light primary text color
        ctx.font = 'bold 18px Poppins, sans-serif';
        ctx.textAlign = 'left';
        // Display HP and MP
        ctx.fillText(`Player - HP: ${player.hp}/${player.maxHp} | MP: ${player.mp}/${player.maxMp}`, 30, 50);
        // Simple player representation (Blue square)
        ctx.fillStyle = '#3498db';
        const playerCombatX = 80;
        const playerCombatY = 150;
        const playerCombatSize = TILE_SIZE * 1.5;
        ctx.fillRect(playerCombatX, playerCombatY, playerCombatSize, playerCombatSize);
        ctx.strokeStyle = '#2980b9';
        ctx.lineWidth = 2; // Thicker border in combat
        ctx.strokeRect(playerCombatX, playerCombatY, playerCombatSize, playerCombatSize);
    }

    // --- Draw Enemy representation/stats ---
    const enemy = currentCombat.enemy;
    if (enemy) {
        ctx.fillStyle = '#e0e0e0';
        ctx.textAlign = 'right';
        // Display Name and HP
        ctx.fillText(`${enemy.name} - HP: ${enemy.hp}/${enemy.maxHp}`, canvas.width - 30, 50);
         // Simple enemy representation (Red square, color varies by type)
         const enemyColor = enemy.name === "Cave Troll" ? '#c0392b' : '#e74c3c';
         const enemyStroke = enemy.name === "Cave Troll" ? '#a03020' : '#c0392b';
         const enemyCombatSize = TILE_SIZE * 1.5;
         const enemyCombatX = canvas.width - 80 - enemyCombatSize;
         const enemyCombatY = 150;
        ctx.fillStyle = enemyColor;
        ctx.fillRect(enemyCombatX, enemyCombatY, enemyCombatSize, enemyCombatSize);
        ctx.strokeStyle = enemyStroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(enemyCombatX, enemyCombatY, enemyCombatSize, enemyCombatSize);
    }

     // --- Draw Turn indicator ---
     ctx.fillStyle = '#00ffff'; // Cyan accent color
     ctx.font = 'bold 22px Poppins, sans-serif'; // Bolder turn indicator
     ctx.textAlign = 'center';
     ctx.shadowColor = 'black';
     ctx.shadowBlur = 4;
     const turnText = currentCombat.turn === 'player' ? "YOUR TURN" : `${enemy ? enemy.name.toUpperCase() : 'ENEMY'} TURN`;
     ctx.fillText(turnText, canvas.width / 2, 30); // Slightly lower
     ctx.shadowBlur = 0; // Reset shadow for other text

    // Action prompts are handled by logMessage below the canvas
}

// Function to specifically update stats during combat (redraws screen)
function updateCombatUI() {
    // Update UI only if combat is active and game isn't over
    if (gameState === 'combat' && currentCombat.active) {
        // Redraw the entire combat screen (background, entities, stats)
        drawCombatScreen();
        // Draw any active effects (like damage numbers) on top
        drawEffects();
    }
}


function draw() {
     // Skip drawing if game state is menu or loading (handled by HTML/CSS)
     if (gameState === 'menu') return;

    // Clear canvas with background color
    ctx.fillStyle = '#1a1a2e'; // Match dark background from CSS theme
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw based on game state
    if (gameState === 'explore' || gameState === 'dialogue') {
        drawMap();
        drawEntities();
         if (gameState === 'dialogue') {
             // Optional: Add a subtle dimming overlay during dialogue
             ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
             ctx.fillRect(0, 0, canvas.width, canvas.height);
         }
    } else if (gameState === 'combat') {
        // Combat screen draws itself fully via drawCombatScreen / updateCombatUI
         drawCombatScreen(); // Ensure it's drawn if state is combat
    } else if (gameState === 'gameOver') {
        // Game over screen is drawn once in handlePlayerDefeat.
        // The game loop stops, so no continuous drawing needed.
        return; // Stop drawing if game over
    }

    // Draw visual effects (damage numbers, flashes) on top of everything else
    drawEffects();
}

// --- Input Handling ---
document.addEventListener('keydown', (e) => {
    // Ignore input if game is over, in menu, or if focused on an input field elsewhere
    if (gameState === 'gameOver' || gameState === 'menu' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
    }

    // Normalize key (lowercase) for easier comparison
    const key = e.key.toLowerCase();

    // Prevent default browser behavior for game keys to avoid scrolling etc.
    const gameKeys = ['w', 'a', 's', 'd', 'e', 'q', 'm', 'p', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    if (gameKeys.includes(key)) {
        e.preventDefault(); // Prevent default action for game keys
    }


    switch (gameState) {
        case 'explore':
            switch (key) {
                case 'w': case 'arrowup': player.move(0, -1); break;
                case 's': case 'arrowdown': player.move(0, 1); break;
                case 'a': case 'arrowleft': player.move(-1, 0); break;
                case 'd': case 'arrowright': player.move(1, 0); break;
                case 'e': player.interact(); break;
                // Add other explore controls here (e.g., inventory 'i')
            }
            break; // End explore case

        case 'combat':
            // Pass combat keys directly to the handler
            handleCombatInput(key);
            break; // End combat case

        case 'dialogue':
             // Pass dialogue keys directly to the handler
             handleDialogueInput(key);
            break; // End dialogue case
    }

    // Redrawing is handled by the game loop, no immediate draw needed here
});

// --- Game Loop ---
let lastTime = 0;
let gameLoopId = null; // To store the requestAnimationFrame ID

function gameLoop(timestamp) {
     // Stop the loop if game is over
     if (gameState === 'gameOver') {
        console.log("Game loop stopped (Game Over).");
        if (gameLoopId) cancelAnimationFrame(gameLoopId); // Explicitly stop loop
        return;
     }
      // Also stop if we somehow return to menu state
     if (gameState === 'menu') {
         console.log("Game loop stopped (Menu State).");
         if (gameLoopId) cancelAnimationFrame(gameLoopId);
         return;
     }


     // Calculate delta time (optional for this turn-based game)
     // const deltaTime = (timestamp - lastTime) / 1000;
     // lastTime = timestamp;

     // --- Update Game Logic ---
     const currentTimeForEffects = performance.now();
     updateEffects(currentTimeForEffects);
     // update(deltaTime); // Placeholder for other time-based updates

     // --- Update UI ---
     updateUI();

     // --- Draw the Game ---
     draw(); // Render the current state

     // --- Request Next Frame ---
     gameLoopId = requestAnimationFrame(gameLoop); // Store ID and keep looping
}

// --- Initialization (Called when Start Game is clicked) ---
function init() {
     if (gameState !== 'menu') {
         console.warn("Attempting to initialize game when not in menu state.");
         return; // Prevent re-initialization
     }

     console.log("Initializing game..."); // Log init start
     gameState = 'explore'; // Change state immediately

    logMessage("Initializing Echoes of Emberstone...", "info");
    loadAnalytics(); // Load persistent analytics first

    // **FIXED:** Set canvas dimensions based on map *after* map is defined
    canvas.width = MAP_WIDTH_TILES * TILE_SIZE;
    canvas.height = MAP_HEIGHT_TILES * TILE_SIZE;
    console.log(`Canvas resized to: ${canvas.width}x${canvas.height}`);


    // Initialize Player at a valid starting position (e.g., 1, 1 which is grass)
    const startX = 1, startY = 1;
    if (isWalkable(startX, startY)) {
        player = new Player(startX, startY);
    } else {
         console.error(`Default starting position (${startX}, ${startY}) is not walkable! Check map data.`);
         // Find first walkable tile as fallback?
         player = new Player(2, 1); // Adjust as needed
    }

    // Clear entity arrays before populating
    npcs = [];
    enemies = [];
    quests = {}; // Reset quests

    // Define Quests
    quests = {
        'fetchBlightroot': new Quest(
            'fetchBlightroot',          // Quest ID
            'Gather Blightroot',        // Title
            'Collect 3 Blightroot samples from the forest.', // Description
            3,                          // Target count
            75,                         // XP Reward
            { type: 'potion', amount: 1 } // Item Reward
        ),
         // Example of another quest:
         // 'slayBats': new Quest('slayBats', 'Clear the Cave Bats', 'Defeat 5 Blight Bats.', 5, 150, { type: 'gold', amount: 50 })
    };


    // Initialize NPCs and Enemies based on map codes
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
        for (let x = 0; x < MAP_WIDTH_TILES; x++) {
             const tileType = map[y][x];

             // Place entities based on tile codes, ensuring tile isn't already occupied at runtime
             // (This check is somewhat redundant if init clears arrays, but good practice)
             if (tileType === 2 && !getEntityAt(x, y)) { // NPC Marker
                 npcs.push(new NPC(x, y, "Elder Willow", {
                     initial: "Welcome, traveler. The forest grows dark... Could you gather 3 Blightroot samples? They glow faintly near the old mine entrance.",
                     questActive: "The Blightroot pulses with a strange energy. Have you found all 3 samples yet?",
                     questReady: "Ah, excellent! You've brought the Blightroot. Thank you for your help.",
                     questComplete: "Your assistance is appreciated. Be wary venturing deeper into these woods."
                 }, 'fetchBlightroot'));
                 // Note: We don't modify the original 'map' array here. Rendering just draws entities over floor tiles.

             } else if (tileType === 3 && !getEntityAt(x, y)) { // Regular Enemy Marker
                 enemies.push(new Enemy(x, y, "Blight Bat", 12, 3, 1, 50, { item: 'potion', chance: 0.15 })); // Bat stats

             } else if (tileType === 5 && !getEntityAt(x, y)) { // Stronger Enemy Marker
                  enemies.push(new Enemy(x, y, "Cave Troll", 25, 5, 2, 120, { item: 'potion', chance: 0.3 })); // Troll stats
             }
        }
    }


    // Set initial analytics state (session start time reset by loadAnalytics)
    analytics.lastAreaVisited = 'Havenwood';

    // Auto-save analytics periodically and on window close
    // **FIXED:** Clear existing interval before setting a new one if init could be called multiple times (though guarded now)
    if (window.analyticsSaveInterval) clearInterval(window.analyticsSaveInterval);
    window.analyticsSaveInterval = setInterval(saveAnalytics, 60000); // Save every 60 seconds

    // Remove previous listener before adding a new one (safer if init is somehow called again)
    window.removeEventListener('beforeunload', saveAnalytics);
    window.addEventListener('beforeunload', saveAnalytics); // Save when closing tab/browser

    // Initial UI update to reflect loaded data and player stats
    updateUI();

    // Start the game loop
    lastTime = performance.now(); // Initialize lastTime for deltaTime calculation
    // **FIXED:** Ensure loop doesn't restart if already running
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop); // Start the loop

    logMessage("Game started! Use WASD/Arrows to move, E to interact.", "info");
    console.log("Game initialization complete. Loop started.");
}

// --- Start the Game (triggered by menu button) ---
// The DOMContentLoaded listener handles the button click and calls init()

// --- Main Menu Logic with Fade-In and Music ---
document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM Loaded. Setting up menu..."); // Debug log

    const startBtn = document.getElementById("startGameBtn");
    const menu = document.getElementById("mainMenu");
    // **FIXED:** Use the correct ID 'gameContainer'
    const gameContainer = document.getElementById("gameContainer");
    const bgMusic = document.getElementById("bgMusic");

    // Get message log element reference here, though it's initially hidden
    messageLog = document.getElementById('messageLog');

    // Ensure all elements exist before adding listeners
    if (startBtn && menu && gameContainer && bgMusic && messageLog) {
        console.log("Menu elements found."); // Debug log
        startBtn.addEventListener("click", () => {
            console.log("Start Game button clicked!"); // Debug log

            // Hide menu and show game container
            menu.style.display = "none";
            gameContainer.style.display = "flex"; // Use flex as per CSS
            // **FIXED:** Add fade-in class AFTER setting display to flex/block
            gameContainer.classList.add("fade-in");

            // Attempt to play background music (user interaction needed)
            bgMusic.volume = 0.2; // Lower volume slightly
            bgMusic.play().then(() => {
                console.log("Background music started.");
            }).catch(err => {
                console.warn("Autoplay blocked. Music requires user interaction.", err);
                // Optional: Show a 'click anywhere to enable sound' message?
            });

            // Initialize and start the game *after* UI is visible
            try {
                // **CRITICAL:** Call init() here to start the game logic & loop
                init();
            } catch (error) {
                 console.error("Error during game initialization:", error);
                 // Try to display error in the message log if possible
                 logMessage("A critical error occurred during startup. Please refresh.", "error");
                 // Optionally display a user-friendly error message directly on the page if UI fails
                 gameContainer.innerHTML = "<p style='color:red; text-align:center; padding: 20px;'>Error starting game. Check console (F12).</p>";
            }
        });
    } else {
        console.error("Initialization Error: Could not find required elements. Check IDs: startGameBtn, mainMenu, gameContainer, bgMusic, messageLog.");
        document.body.innerHTML = "<p style='color:red; text-align: center; margin-top: 50px;'>Error: Could not load game resources. Please check the console (F12) and ensure HTML elements have correct IDs (startGameBtn, mainMenu, gameContainer, bgMusic, messageLog).</p>";
    }
});
