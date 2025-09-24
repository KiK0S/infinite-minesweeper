#pragma once

#include <cstdint>
#include <unordered_map>
#include <vector>

struct CellUpdate {
    int x = 0;
    int y = 0;
    bool revealed = false;
    bool flagged = false;
    bool mine = false;
    int adjacent = 0;
    bool detonated = false;
    bool newlyDiscovered = false;
};

class GameSession {
  public:
    explicit GameSession(std::uint64_t seed);

    std::vector<CellUpdate> reveal(int x, int y);
    std::vector<CellUpdate> toggleFlag(int x, int y);
    void reset(std::uint64_t seed);

    void setMineProbability(double probability);
    double mineProbability() const { return m_density; }

    bool isAlive() const { return m_alive; }
    std::uint64_t seed() const { return m_seed; }

  private:
    struct CellState {
        bool revealed = false;
        bool flagged = false;
        bool hasMine = false;
        int adjacent = -1;
    };

    using Key = std::int64_t;

    Key keyFromCoords(int x, int y) const;
    CellState &getCell(int x, int y);
    bool hasMine(int x, int y);
    int adjacentMines(int x, int y);
    std::vector<CellUpdate> revealInternal(int x, int y);
    bool computeMine(int x, int y) const;

    static std::uint64_t hashCoords(std::uint64_t seed, int x, int y);

    std::uint64_t m_seed;
    bool m_alive = true;
    double m_density = 0.18;
    std::unordered_map<Key, CellState> m_cells;
};
