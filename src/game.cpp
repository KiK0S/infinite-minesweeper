#include "game.hpp"

#include <algorithm>
#include <limits>
#include <queue>
#include <unordered_set>

namespace {
constexpr double kMinDensity = 0.05;
constexpr double kMaxDensity = 0.35;

std::uint64_t splitmix64(std::uint64_t x) {
    x += 0x9e3779b97f4a7c15ull;
    x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9ull;
    x = (x ^ (x >> 27)) * 0x94d049bb133111ebull;
    x = x ^ (x >> 31);
    return x;
}

std::uint64_t pairToUint(std::int64_t a, std::int64_t b) {
    const std::uint64_t A = static_cast<std::uint64_t>(a) + 0x8000'0000ull;
    const std::uint64_t B = static_cast<std::uint64_t>(b) + 0x8000'0000ull;
    return (A << 32) ^ B;
}
}  // namespace

GameSession::GameSession(std::uint64_t seed) : m_seed(seed) {}

std::uint64_t GameSession::hashCoords(std::uint64_t seed, int x, int y) {
    const std::uint64_t packed = pairToUint(x, y);
    return splitmix64(seed ^ packed);
}

GameSession::Key GameSession::keyFromCoords(int x, int y) const {
    return (static_cast<std::int64_t>(x) << 32) ^ static_cast<std::uint32_t>(y);
}

void GameSession::reset(std::uint64_t seed) {
    m_seed = seed;
    m_alive = true;
    m_cells.clear();
}

void GameSession::setMineProbability(double probability) {
    m_density = std::clamp(probability, kMinDensity, kMaxDensity);
    m_cells.clear();
    m_alive = true;
}

bool GameSession::computeMine(int x, int y) const {
    const auto hash = hashCoords(m_seed, x, y);
    const long double threshold =
        m_density * static_cast<long double>(std::numeric_limits<std::uint64_t>::max());
    return static_cast<long double>(hash) < threshold;
}

GameSession::CellState &GameSession::getCell(int x, int y) {
    const auto key = keyFromCoords(x, y);
    auto [it, inserted] = m_cells.try_emplace(key);
    if (inserted) {
        it->second.hasMine = computeMine(x, y);
        it->second.adjacent = -1;
    }
    return it->second;
}

bool GameSession::hasMine(int x, int y) {
    return getCell(x, y).hasMine;
}

int GameSession::adjacentMines(int x, int y) {
    auto &cell = getCell(x, y);
    if (cell.adjacent >= 0) {
        return cell.adjacent;
    }
    int total = 0;
    for (int dx = -1; dx <= 1; ++dx) {
        for (int dy = -1; dy <= 1; ++dy) {
            if (dx == 0 && dy == 0) {
                continue;
            }
            if (hasMine(x + dx, y + dy)) {
                ++total;
            }
        }
    }
    cell.adjacent = total;
    return total;
}

std::vector<CellUpdate> GameSession::reveal(int x, int y) {
    if (!m_alive) {
        return {};
    }
    return revealInternal(x, y);
}

std::vector<CellUpdate> GameSession::revealInternal(int x, int y) {
    std::vector<CellUpdate> updates;
    auto &origin = getCell(x, y);

    if (origin.flagged) {
        updates.push_back({x, y, origin.revealed, origin.flagged, origin.hasMine,
                           adjacentMines(x, y), false, false});
        return updates;
    }

    if (origin.revealed) {
        updates.push_back({x, y, origin.revealed, origin.flagged, origin.hasMine,
                           adjacentMines(x, y), false, false});
        return updates;
    }

    if (origin.hasMine) {
        origin.revealed = true;
        m_alive = false;
        updates.push_back({x, y, true, false, true, adjacentMines(x, y), true, true});
        return updates;
    }

    std::queue<std::pair<int, int>> frontier;
    std::unordered_set<Key> visited;
    frontier.emplace(x, y);
    visited.insert(keyFromCoords(x, y));

    while (!frontier.empty()) {
        auto [cx, cy] = frontier.front();
        frontier.pop();
        auto &cell = getCell(cx, cy);
        if (cell.revealed || cell.flagged) {
            continue;
        }
        cell.revealed = true;
        const int adj = adjacentMines(cx, cy);
        updates.push_back({cx, cy, true, cell.flagged, cell.hasMine, adj, false, true});

        if (adj == 0) {
            for (int dx = -1; dx <= 1; ++dx) {
                for (int dy = -1; dy <= 1; ++dy) {
                    if (dx == 0 && dy == 0) {
                        continue;
                    }
                    const int nx = cx + dx;
                    const int ny = cy + dy;
                    const auto key = keyFromCoords(nx, ny);
                    if (visited.insert(key).second) {
                        auto &neighbor = getCell(nx, ny);
                        if (!neighbor.flagged && !neighbor.hasMine) {
                            frontier.emplace(nx, ny);
                        }
                    }
                }
            }
        }
    }

    return updates;
}

std::vector<CellUpdate> GameSession::toggleFlag(int x, int y) {
    auto &cell = getCell(x, y);
    if (cell.revealed) {
        return {CellUpdate{x, y, cell.revealed, cell.flagged, cell.hasMine,
                           adjacentMines(x, y), false, false}};
    }
    cell.flagged = !cell.flagged;
    return {CellUpdate{x, y, cell.revealed, cell.flagged, cell.hasMine,
                       adjacentMines(x, y), false, false}};
}
