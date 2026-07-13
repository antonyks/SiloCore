# Contributing to SiloCore

Thank you for your interest in contributing! SiloCore is an open-source project under the **Apache 2.0 License**.  
We welcome improvements to code, documentation, tests, and examples.

---

## 🧩 Ways to Contribute
- 🐛 **Report Bugs** – open an issue describing the problem and reproduction steps.  
- 💡 **Request Features** – suggest enhancements or new capabilities.  
- 🧰 **Submit Code** – fix bugs, add modules, or improve tooling.  
- 🧾 **Improve Docs** – clarify instructions or add tutorials.

---

## 🪜 Getting Started
1. **Fork** the repository and **clone** your fork.
2. Install dependencies:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
3. Copy environment examples:
    cp backend/.env.example backend/.env
    cp frontend/.env.example frontend/.env
4. Start the stack:
    docker compose up --build

## 🧠 Code Style
1. Language: TypeScript (strict mode enabled)
2. Linting: ESLint + Prettier (run npm run lint)
3. Commits: Use Conventional Commits
    feat(user): add user profile endpoint
    fix(auth): correct token expiration check
4. Tests: Use Jest for both backend and frontend.
    npm test

## 🧪 Pull Request Process
1. Create a new branch from main:
    git checkout -b feat/my-feature
2. Ensure code is formatted and tests pass.
3. Update relevant documentation.
4. Open a Pull Request with:
    Clear title and description
    Linked issue (if applicable)
5. A maintainer will review and merge after approval.

## 📜 License
By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.



---

## 🌐 `CODE_OF_CONDUCT.md`

```markdown
# Contributor Covenant Code of Conduct

## Our Pledge
We pledge to make participation in the SiloCore community a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

## Our Standards
Examples of behavior that contributes to a positive environment include:
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Accepting constructive criticism gracefully
- Focusing on what is best for the community
- Showing empathy toward others

Examples of unacceptable behavior include:
- Harassment or personal attacks
- Trolling or insulting comments
- Publishing others’ private information
- Any conduct that would be inappropriate in a professional setting

## Our Responsibilities
Project maintainers are responsible for clarifying standards of behavior and taking appropriate action when unacceptable behavior occurs.

## Scope
This Code applies both within project spaces and in public spaces when an individual represents the project or its community.

## Attribution
This Code of Conduct is adapted from the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct.html), version 2.1.

