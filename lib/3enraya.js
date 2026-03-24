/**

* Lógica del juego 3 en raya (Michi)

*/

export class TicTacToe {
  constructor(player1, player2, chatId, onTimeout = null) {
    this.player1 = player1; // ID del jugador 1
    this.player2 = player2; // ID del jugador 2
    this.chatId = chatId;   // ID del chat/grupo
    this.board = Array(9).fill(null); // Tablero 3x3 (0-8)
    this.currentPlayer = player1; // Jugador actual
    this.winner = null; // Ganador
    this.gameActive = true; // Estado del juego
    this.timeout = null; // Timeout para inactividad
    this.onTimeout = onTimeout; // Callback cuando hay timeout
    this.startTime = Date.now(); // Hora de inicio
    this.lastMove = Date.now(); // Último movimiento
    this.moves = 0; // Número de movimientos
  }

  
  getBoard() {
    const numbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
    let board = '';

    for (let i = 0; i < 9; i++) {
      if (this.board[i] === 'X') {
        board += '❌';
      } else if (this.board[i] === 'O') {
        board += '⭕';
      } else {
        board += numbers[i];
      }

      if ((i + 1) % 3 === 0) {
        board += '\n';
        if (i < 6) board += '─────────────\n';
      } else {
        board += ' │ ';
      }
    }

    return board;
  }

  
  makeMove(position, playerId) {
    
    if (playerId !== this.currentPlayer) {
      return { success: false, message: '❌ No es tu turno!' };
    }

    
    if (position < 1 || position > 9) {
      return { success: false, message: '❌ Posición inválida. Usa números del 1 al 9.' };
    }

    const index = position - 1;

  
    if (this.board[index] !== null) {
      return { success: false, message: '❌ Esa casilla ya está ocupada.' };
    }

    
    this.board[index] = this.currentPlayer === this.player1 ? 'X' : 'O';
    this.moves++;
    this.lastMove = Date.now();

    
    if (this.checkWinner()) {
      this.winner = this.currentPlayer;
      this.gameActive = false;
      this.clearTimeout(); 
      return {
        success: true,
        finished: true,
        winner: this.currentPlayer,
        message: `🎉 ¡${this.currentPlayer === this.player1 ? 'Jugador 1' : 'Jugador 2'} ha ganado!`
      };
    }

    
    if (this.moves === 9) {
      this.gameActive = false;
      this.clearTimeout(); 
      return {
        success: true,
        finished: true,
        draw: true,
        message: '👻 Es un empate!'
      };
    }

    
    this.currentPlayer = this.currentPlayer === this.player1 ? this.player2 : this.player1;

    
    if (this.onTimeout) {
      this.startInactivityTimeout();
    }

    return {
      success: true,
      message: `✅ Movimiento realizado. Turno de ${this.currentPlayer === this.player1 ? 'Jugador 1 (❌)' : 'Jugador 2 (⭕)'}`
    };
  }

  
  checkWinner() {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], 
      [0, 3, 6], [1, 4, 7], [2, 5, 8], 
      [0, 4, 8], [2, 4, 6] 
    ];

    return winPatterns.some(pattern => {
      const [a, b, c] = pattern;
      return this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c];
    });
  }

  
  getGameInfo() {
    return {
      player1: this.player1,
      player2: this.player2,
      currentPlayer: this.currentPlayer,
      board: this.board,
      gameActive: this.gameActive,
      winner: this.winner,
      moves: this.moves,
      startTime: this.startTime,
      lastMove: this.lastMove
    };
  }

  
  cancelGame(reason = 'inactividad') {
    this.gameActive = false;
    this.winner = null;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    return {
      cancelled: true,
      reason: reason,
      players: [this.player1, this.player2],
      chatId: this.chatId
    };
  }

  
  startInactivityTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    if (!this.onTimeout) return; 

    this.timeout = setTimeout(async () => {
      
      if (this.gameActive) {
        await this.onTimeout(this.cancelGame('inactividad'));
      }
    }, 60000); 
  }

  
  clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}


export function getRandomReward() {
  return Math.floor(Math.random() * 251) + 450;
}


export function getInactivityPenalty() {
  return 150;
}
