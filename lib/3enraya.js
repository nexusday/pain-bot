/**

* Lógica del juego 3 en raya (Michi)

*/

export class TresEnRaya {
  constructor(player1, player2, chatId, onTimeout = null) {
    this.player1 = player1;
    this.player2 = player2;
    this.chatId = chatId;
    this.board = Array(9).fill(null);
    this.currentPlayer = player1;
    this.winner = null;
    this.gameActive = true;
    this.timeout = null;
    this.onTimeout = onTimeout;
    this.startTime = Date.now();
    this.lastMove = Date.now();
    this.moves = 0;
  }

  
  obtenerTablero() {
    const numeros = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
    let tablero = '';

    for (let i = 0; i < 9; i++) {
      if (this.board[i] === 'X') {
        tablero += '❌';
      } else if (this.board[i] === 'O') {
        tablero += '⭕';
      } else {
        tablero += numeros[i];
      }

      if ((i + 1) % 3 === 0) {
        tablero += '\n';
        if (i < 6) tablero += '─────────────\n';
      } else {
        tablero += ' │ ';
      }
    }

    return tablero;
  }

  
  realizarMovimiento(position, playerId) {
    
    if (playerId !== this.currentPlayer) {
      return { success: false, message: '❌ No es tu turno!' };
    }

    
    if (position < 1 || position > 9) {
      return { success: false, message: '❌ Posición inválida. Usa números del 1 al 9.' };
    }

    const indice = position - 1;

  
    if (this.board[indice] !== null) {
      return { success: false, message: '❌ Esa casilla ya está ocupada.' };
    }

    
    this.board[indice] = this.currentPlayer === this.player1 ? 'X' : 'O';
    this.moves++;
    this.lastMove = Date.now();

    
    if (this.verificarGanador()) {
      this.winner = this.currentPlayer;
      this.gameActive = false;
      this.limpiarTimeout(); 
      return {
        success: true,
        finished: true,
        winner: this.currentPlayer,
        message: `🎉 ¡${this.currentPlayer === this.player1 ? 'Jugador 1' : 'Jugador 2'} ha ganado!`
      };
    }

    
    if (this.moves === 9) {
      this.gameActive = false;
      this.limpiarTimeout(); 
      return {
        success: true,
        finished: true,
        draw: true,
        message: '👻 Es un empate!'
      };
    }

    
    this.currentPlayer = this.currentPlayer === this.player1 ? this.player2 : this.player1;

    
    if (this.onTimeout) {
      this.iniciarTimeoutInactividad();
    }

    return {
      success: true,
      message: `✅ Movimiento realizado. Turno de ${this.currentPlayer === this.player1 ? 'Jugador 1 (❌)' : 'Jugador 2 (⭕)'}`
    };
  }

  
  verificarGanador() {
    const patronesVictoria = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], 
      [0, 3, 6], [1, 4, 7], [2, 5, 8], 
      [0, 4, 8], [2, 4, 6] 
    ];

    return patronesVictoria.some(patron => {
      const [a, b, c] = patron;
      return this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c];
    });
  }

  obtenerCeldasGanadoras() {
    const patronesVictoria = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    for (const patron of patronesVictoria) {
      const [a, b, c] = patron;
      if (this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
        return patron;
      }
    }
    return null;
  }

  
  obtenerInfoJuego() {
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

  
  cancelarJuego(reason = 'inactividad') {
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

  
  iniciarTimeoutInactividad() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    if (!this.onTimeout) return; 

    this.timeout = setTimeout(async () => {
      
      if (this.gameActive) {
        await this.onTimeout(this.cancelarJuego('inactividad'));
      }
    }, 60000); 
  }

  
  limpiarTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

TresEnRaya.prototype.getBoard = TresEnRaya.prototype.obtenerTablero
TresEnRaya.prototype.makeMove = TresEnRaya.prototype.realizarMovimiento
TresEnRaya.prototype.checkWinner = TresEnRaya.prototype.verificarGanador
TresEnRaya.prototype.getWinningCells = TresEnRaya.prototype.obtenerCeldasGanadoras
TresEnRaya.prototype.getGameInfo = TresEnRaya.prototype.obtenerInfoJuego
TresEnRaya.prototype.cancelGame = TresEnRaya.prototype.cancelarJuego
TresEnRaya.prototype.startInactivityTimeout = TresEnRaya.prototype.iniciarTimeoutInactividad
TresEnRaya.prototype.clearTimeout = TresEnRaya.prototype.limpiarTimeout

export function obtenerRecompensaAleatoria() {
  return Math.floor(Math.random() * 251) + 450;
}

export function obtenerPenalizacionInactividad() {
  return 150;
}

export {
  TresEnRaya as TicTacToe,
  obtenerRecompensaAleatoria as getRandomReward,
  obtenerPenalizacionInactividad as getInactivityPenalty
}
