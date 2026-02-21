# Contributing to Quick Share CLI

First off, thank you for considering contributing to Quick Share CLI! 🎉

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check the existing issues to see if the problem has already been reported. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (commands, file paths, etc.)
- **Describe the behavior you observed** and what behavior you expected
- **Include screenshots** if applicable
- **Include your environment details** (OS, Node version, rclone version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a step-by-step description** of the suggested enhancement
- **Provide specific examples** to demonstrate the enhancement
- **Explain why this enhancement would be useful**

### Pull Requests

1. Fork the repository
2. Create a new branch from `main`: `git checkout -b feature/my-feature` or `git checkout -b fix/my-fix`
3. Make your changes
4. Add or update tests as needed
5. Ensure all tests pass: `npm test`
6. Update documentation as needed
7. Commit your changes with a clear message
8. Push to your fork: `git push origin feature/my-feature`
9. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 14+
- npm or yarn
- rclone (for testing uploads)
- Git

### Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/quick-share-cli.git
cd quick-share-cli

# Install dependencies
npm install

# Run tests
npm test

# Run linting
npm run lint
```

### Project Structure

```
quick-share-cli/
├── bin/              # CLI entry points
│   └── quick-share.js
├── lib/              # Core functionality
│   └── upload.js
├── scripts/          # Lifecycle scripts
│   ├── postinstall.js
│   └── preuninstall.js
├── test/             # Test files
├── examples/         # Example configurations
├── assets/           # Branding assets
└── .github/          # GitHub templates and workflows
```

### Coding Standards

- Use ESLint for code linting
- Write tests for new features
- Follow existing code style
- Use meaningful variable names
- Add JSDoc comments for functions

### Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

Example:

```
Add support for custom config paths

- Add --config flag to upload command
- Update validation to check custom paths
- Add tests for custom config functionality

Fixes #123
```

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm test -- --watch
```

## Documentation

- Update README.md if you change functionality
- Update CHANGELOG.md following the Keep a Changelog format
- Add JSDoc comments to new functions

## Recognition

Contributors will be recognized in our README.md file and release notes.

## Questions?

Feel free to open an issue for questions or join the discussion.

Thank you for contributing! 🚀
