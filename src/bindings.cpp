#include <cstdint>
#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "game.hpp"

namespace {

emscripten::val toJsObject(const CellUpdate &update) {
    emscripten::val object = emscripten::val::object();
    object.set("x", update.x);
    object.set("y", update.y);
    object.set("revealed", update.revealed);
    object.set("flagged", update.flagged);
    object.set("mine", update.mine);
    object.set("adjacent", update.adjacent);
    object.set("detonated", update.detonated);
    object.set("newlyDiscovered", update.newlyDiscovered);
    return object;
}

emscripten::val toJsArray(const std::vector<CellUpdate> &updates) {
    emscripten::val array = emscripten::val::array();
    const auto length = static_cast<int>(updates.size());
    for (int i = 0; i < length; ++i) {
        array.set(i, toJsObject(updates[static_cast<std::size_t>(i)]));
    }
    return array;
}

emscripten::val reveal(GameSession &session, int x, int y) {
    return toJsArray(session.reveal(x, y));
}

emscripten::val toggleFlag(GameSession &session, int x, int y) {
    return toJsArray(session.toggleFlag(x, y));
}

}  // namespace

EMSCRIPTEN_BINDINGS(infinite_minesweeper) {
    emscripten::class_<GameSession>("GameSession")
        .constructor<std::uint64_t>()
        .function("reveal", &reveal)
        .function("toggleFlag", &toggleFlag)
        .function("reset", &GameSession::reset)
        .function("setMineProbability", &GameSession::setMineProbability)
        .function("mineProbability", &GameSession::mineProbability)
        .function("isAlive", &GameSession::isAlive)
        .function("seed", &GameSession::seed);
}
