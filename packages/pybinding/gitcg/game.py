from __future__ import annotations
from cffi import FFI
from enum import Enum

from .player import Player
from .create_param import CreateParam
from .state import State
from . import low_level as ll
from ._proto.rpc_pb2 import Request
from ._proto.notification_pb2 import Notification

class _GameCallback(ll.ICallback):
    _player: Player

    def __init__(self, player: Player):
        self._player = player

    def on_rpc(self, request: bytes) -> bytes:
        request_msg = Request()
        request_msg.ParseFromString(request)
        response_msg = self._player._on_rpc(request_msg)
        return response_msg.SerializeToString()

    def on_notify(self, notification: bytes):
        notification_msg = Notification()
        notification_msg.ParseFromString(notification)
        self._player.on_notify(notification_msg)

    def on_io_error(self, error_msg: str):
        self._player.on_io_error(error_msg)


class GameStatus(Enum):
    """
    Represent the status of `gitcg.Game`.
    - If a `gitcg.Game`'s status is `NOT_STARTED`, it can be started.
    - If a `gitcg.Game`'s status is `RUNNING`, it can be stepped through.
    - If a `gitcg.Game`'s status is `FINISHED` or `ABORTED`, it cannot be used anymore.
    - If a `gitcg.Game`'s status is `FINISHED`, it can be queried for the winner.
    - If a `gitcg.Game`'s status is `ABORTED`, one can query its error message using `gitcg.Game.error`.
    """
    NOT_STARTED = ll.GAME_STATUS_NOT_STARTED
    RUNNING = ll.GAME_STATUS_RUNNING
    FINISHED = ll.GAME_STATUS_FINISHED
    ABORTED = ll.GAME_STATUS_ABORTED


class Game:
    """
    A GI-TCG Game instance. It can be created with a State or a CreateParam.
    ```py
    game = Game(create_param=CreateParam(deck0=DECK0, deck1=DECK1))
    ```
    
    The game can be started and stepped through. A game instance can only be used once.
    ```py
    game.start()
    while game.is_running():
        game.step()
    ```
    """

    _game_handle: FFI.CData
    _players: list[Player | None] = [None, None]
    _player_callbacks: list[_GameCallback | None] = [None, None]
    _player_callback_handles: list[FFI.CData | None] = [None, None]

    def __init__(
        self, /, state: State | None = None, create_param: CreateParam | None = None
    ):
        if state is not None:
            self._game_handle = ll.game_new(state._state_handle)
        elif create_param is not None:
            state = State(create_param=create_param)
            self._game_handle = ll.game_new(state._state_handle)
        else:
            raise ValueError("either state or create_param must be provided")

    def set_player(self, who: int, player: Player):
        """
        Set the player behavior of this game.
        A player is an implementation of interface `gitcg.Player`.
        """
        assert who == 0 or who == 1
        callback = _GameCallback(player)
        self._player_callbacks[who] = callback
        handle = ll.game_set_handlers(self._game_handle, who, callback)
        self._player_callback_handles[who] = handle
        self._players[who] = player

    def start(self):
        """
        Start the game. Precondition: `status() == GameStatus.NOT_STARTED`.
        """
        assert self.status() == GameStatus.NOT_STARTED
        ll.game_step(self._game_handle)

    def step(self):
        """
        Step the game to next pause point. Precondition: `status() == GameStatus.RUNNING`.
        """
        assert self.status() == GameStatus.RUNNING
        ll.game_step(self._game_handle)

    def status(self) -> GameStatus:
        return GameStatus(ll.game_get_status(self._game_handle))

    def is_running(self) -> bool:
        return self.status() == GameStatus.RUNNING

    def state(self) -> State:
        """
        Get the `gitcg.State` of this game.
        """
        return State(handle=ll.game_get_state(self._game_handle))

    def is_resumable(self) -> bool:
        """
        Whether current `gitcg.State` of this game is resumable, i.e. can be used to create a new game.
        """
        return ll.game_is_resumable(self._game_handle)

    def error(self) -> str | None:
        """
        If this game is aborted, return the error message.
        """
        assert self.status() == GameStatus.ABORTED
        return ll.game_get_error(self._game_handle)

    def json(self) -> str:
        """
        Returns the json representation of the current `gitcg.State` of this game.
        """
        return self.state().json()

    def winner(self):
        return self.state().winner()

    def round_number(self):
        return self.state().round_number()

    def current_turn(self):
        return self.state().current_turn()

    def __del__(self):
        ll.game_free(self._game_handle)