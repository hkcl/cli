# `oclif readme`

adds commands to README.md in current directory
The readme must have any of the following tags inside of it for it to be replaced or else it will do nothing:

# Usage

<!-- usage -->

# Commands

<!-- commands -->

# Table of contents

<!-- toc -->

Customize the code URL prefix by setting oclif.repositoryPrefix in package.json.

- [`oclif readme`](#oclif-readme)

## `oclif readme`

adds commands to README.md in current directory

```
USAGE
  $ oclif readme --output-dir <value> ---path <value> [--aliases] [--nested-topics-depth <value> --multi]
    [--plugin-directory <value>] [--repository-prefix <value>] [--version <value>]

FLAGS
  --[no-]aliases                 Include aliases in the command list.
  --multi                        Create a different markdown page for each topic.
  --nested-topics-depth=<value>  Max nested topics depth for multi markdown page generation. Use with --multi enabled.
  --output-dir=<value>           (required) [default: docs] Output directory for multi docs.
  --plugin-directory=<value>     Plugin directory to generate README for. Defaults to the current directory.
  --readme-path=<value>          (required) [default: README.md] Path to the README file.
  --repository-prefix=<value>    A template string used to build links to the source code.
  --version=<value>              Version to use in readme links. Defaults to the version in package.json.

DESCRIPTION
  adds commands to README.md in current directory
  The readme must have any of the following tags inside of it for it to be replaced or else it will do nothing:
  # Usage
  <!-- usage -->
  # Commands
  <!-- commands -->
  # Table of contents
  <!-- toc -->

  Customize the code URL prefix by setting oclif.repositoryPrefix in package.json.
```

_See code: [src/commands/readme.ts](https://github.com/oclif/oclif/blob/v4.5.2/src/commands/readme.ts)_
