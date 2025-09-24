#include <cstdint>
#include <emscripten/bind.h>

#include "game.hpp"

EMSCRIPTEN_BINDINGS(infinite_minesweeper) {
    emscripten::value_object<CellUpdate>("CellUpdate")
        .field("x", &CellUpdate::x)
        .field("y", &CellUpdate::y)
        .field("revealed", &CellUpdate::revealed)
        .field("flagged", &CellUpdate::flagged)
        .field("mine", &CellUpdate::mine)
        .field("adjacent", &CellUpdate::adjacent)
        .field("detonated", &CellUpdate::detonated)
        .field("newlyDiscovered", &CellUpdate::newlyDiscovered);

    emscripten::register_vector<CellUpdate>("CellUpdateVector");

    emscripten::class_<GameSession>("GameSession")
        .constructor<std::uint64_t>()
        .function("reveal", &GameSession::reveal)
        .function("toggleFlag", &GameSession::toggleFlag)
        .function("reset", &GameSession::reset)
        .function("setMineProbability", &GameSession::setMineProbability)
        .function("mineProbability", &GameSession::mineProbability)
        .function("isAlive", &GameSession::isAlive)
        .function("seed", &GameSession::seed);
}
