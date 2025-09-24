#include <cstdint>
#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "game.hpp"

namespace {

emscripten::val toJsArray(const std::vector<CellUpdate> &updates) {
    emscripten::val array = emscripten::val::array();
    for (std::size_t i = 0; i < updates.size(); ++i) {
        const auto &update = updates[i];
        emscripten::val item = emscripten::val::object();
        item.set("x", update.x);
        item.set("y", update.y);
        item.set("revealed", update.revealed);
        item.set("flagged", update.flagged);
        item.set("mine", update.mine);
        item.set("adjacent", update.adjacent);
        item.set("detonated", update.detonated);
        item.set("newlyDiscovered", update.newlyDiscovered);
        array.set(i, item);
    }
    return array;
}

}  // namespace

EMSCRIPTEN_BINDINGS(infinite_minesweeper) {
    emscripten::class_<GameSession>("GameSession")
        .constructor<std::uint64_t>()
        .function(
            "reveal",
            emscripten::optional_override([](GameSession &session, int x, int y) {
                return toJsArray(session.reveal(x, y));
            }))
        .function(
            "toggleFlag",
            emscripten::optional_override([](GameSession &session, int x, int y) {
                return toJsArray(session.toggleFlag(x, y));
            }))
        .function("reset", &GameSession::reset)
        .function("setMineProbability", &GameSession::setMineProbability)
        .function("mineProbability", &GameSession::mineProbability)
        .function("isAlive", &GameSession::isAlive)
        .function("seed", &GameSession::seed);
}
