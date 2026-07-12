# Astro Starter Kit: Basics

```sh
npm create astro@latest -- --template basics
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).


## Case Study: Pragmatic Optimization vs. Code Complexity (Refer to the "log_files_to_show_optimization" folder for the log files)

### Hypothesis
In the initial architecture of "Driftaku", I identified that the client-side pathfinding 
algorithm (BFS) and edge validation lookups used sparse database IDs (e.g., `100016498`) 
resulting in O(N) array lookups. 

I hypothesized that by normalizing these IDs to contiguous integers `[0, n-1]` and 
representing the graph as a bitset adjacency matrix using JavaScript Typed Arrays 
(Uint32Array), I could reduce lookups to O(1) and significantly compress the memory payload.

### Methodology & Benchmarking
Before committing to the refactor, I built a high-precision performance monitoring harness 
using `performance.now()` (microsecond precision) and `TextEncoder` byte-length calculations 
to measure the real-world impact of the current system.

### Results
The empirical data collected from test runs revealed:
*   **Memory Footprint:** JSON Payload was 8.73 KB compared to the theoretical Bitset 
    Payload of 0.31 KB (a 96.4% reduction, but saving only 8.42 KB in absolute terms).
*   **Edge Validation Latency:** Consistently averaged between 0.00 ms and 0.10 ms.
*   **BFS Traversal Latency (N=12):** Averaged 0.10 ms.

### The Decision: Rejecting the Optimization
While the mathematical metrics of the Bitset approach showed a massive relative improvement, 
the absolute gains were functionally imperceptible to a human user (sub-millisecond 
execution times are well below the 100ms latency perception threshold). 

I decided to **reject** the optimization. 

Implementing the ID-normalization and bitset logic would have introduced significant 
code complexity, increased the risk of synchronization bugs between the database 
and the client, and slowed down development velocity. Choosing to maintain the simpler, 
more readable Adjacency List allowed for a highly maintainable codebase with zero impact 
on the end-user experience.