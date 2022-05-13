import { FILE_MANIFEST } from "./cleanup";
import { PROJEN_VERSION } from "./common";
import { Dependencies } from "./dependencies";
import { GitAttributesFile } from "./gitattributes";
import { IgnoreFile } from "./ignore-file";
import { JsonFile } from "./json";
import { Project, ProjectOptions } from "./project";
import { ProjectBuild } from "./project-build";
import { Projenrc, ProjenrcOptions } from "./projenrc-json";
import { Renovatebot, RenovatebotOptions } from "./renovatebot";
import { Task, TaskOptions } from "./task";
import { Tasks, TasksOptions } from "./tasks";

export interface StandardProjectOptions extends ProjectOptions, TasksOptions {
  /**
   * Generate (once) .projenrc.json (in JSON). Set to `false` in order to disable
   * .projenrc.json generation.
   *
   * @default false
   */
  readonly projenrcJson?: boolean;

  /**
   * Options for .projenrc.json
   * @default - default options
   */
  readonly projenrcJsonOptions?: ProjenrcOptions;

  /**
   * Use renovatebot to handle dependency upgrades.
   *
   * @default false
   */
  readonly renovatebot?: boolean;

  /**
   * Options for renovatebot.
   *
   * @default - default options
   */
  readonly renovatebotOptions?: RenovatebotOptions;
}

export class StandardProject extends Project {
  /**
   * The name of the default task (the task executed when `projen` is run without arguments). Normally
   * this task should synthesize the project files.
   */
  public static readonly DEFAULT_TASK = "default";

  /**
   * .gitignore
   */
  public readonly gitignore: IgnoreFile;

  /**
   * The .gitattributes file for this repository.
   */
  public readonly gitattributes: GitAttributesFile;

  /**
   * Project tasks.
   */
  public readonly tasks: Tasks;

  /**
   * Project dependencies.
   */
  public readonly deps: Dependencies;

  /**
   * The command to use in order to run the projen CLI.
   */
  public readonly projenCommand: string;

  /**
   * This is the "default" task, the one that executes "projen". Undefined if
   * the project is being ejected.
   */
  public readonly defaultTask?: Task;

  /**
   * This task ejects the project from projen. This is undefined if the project
   * it self is being ejected.
   *
   * See docs for more information.
   */
  private readonly ejectTask?: Task;

  /**
   * Manages the build process of the project.
   */
  public readonly projectBuild: ProjectBuild;

  constructor(options: StandardProjectOptions) {
    super(options);

    this.gitattributes = new GitAttributesFile(this);
    this.annotateGenerated("/.projen/**"); // contents  of the .projen/ directory are generated by projen
    this.annotateGenerated(`/${this.gitattributes.path}`); // the .gitattributes file itself is generated

    this.gitignore = new IgnoreFile(this, ".gitignore");
    this.gitignore.exclude("node_modules/"); // created by running `npx projen`
    this.gitignore.include(`/${this.gitattributes.path}`);

    // oh no: tasks depends on gitignore so it has to be initialized after
    // smells like dep injectionn but god forbid.
    this.tasks = new Tasks(this, options);

    if (this.ejected) {
      this.projenCommand = "scripts/run-task";
    } else {
      this.projenCommand = options.projenCommand ?? "npx projen";

      this.defaultTask = this.tasks.addTask(StandardProject.DEFAULT_TASK, {
        description: "Synthesize project files",
      });

      this.ejectTask = this.tasks.addTask("eject", {
        description: "Remove projen from the project",
        env: {
          PROJEN_EJECTING: "true",
        },
      });
      this.ejectTask.spawn(this.defaultTask);

      new JsonFile(this, FILE_MANIFEST, {
        omitEmpty: true,
        obj: () => ({
          // replace `\` with `/` to ensure paths match across platforms
          files: this.files
            .filter((f) => f.readonly)
            .map((f) => f.path.replace(/\\/g, "/")),
        }),
      });
    }

    this.projectBuild = new ProjectBuild(this);

    this.deps = new Dependencies(this);

    const projenrcJson = options.projenrcJson ?? false;
    if (projenrcJson) {
      new Projenrc(this, options.projenrcJsonOptions);
    }

    if (options.renovatebot) {
      new Renovatebot(this, options.renovatebotOptions);
    }
  }

  /**
   * Adds a new task to this project. This will fail if the project already has
   * a task with this name.
   *
   * @param name The task name to add
   * @param props Task properties
   */
  public addTask(name: string, props: TaskOptions = {}) {
    return this.tasks.addTask(name, props);
  }

  /**
   * Removes a task from a project.
   *
   * @param name The name of the task to remove.
   *
   * @returns The `Task` that was removed, otherwise `undefined`.
   */
  public removeTask(name: string) {
    return this.tasks.removeTask(name);
  }

  public get buildTask() {
    return this.projectBuild.buildTask;
  }
  public get compileTask() {
    return this.projectBuild.compileTask;
  }
  public get testTask() {
    return this.projectBuild.testTask;
  }
  public get preCompileTask() {
    return this.projectBuild.preCompileTask;
  }
  public get postCompileTask() {
    return this.projectBuild.postCompileTask;
  }
  public get packageTask() {
    return this.projectBuild.packageTask;
  }

  /**
   * Returns the shell command to execute in order to run a task.
   *
   * By default, this is `npx projen@<version> <task>`
   *
   * @param task The task for which the command is required
   */
  public runTaskCommand(task: Task) {
    return `npx projen@${PROJEN_VERSION} ${task.name}`;
  }

  /**
   * Exclude these files from the bundled package. Implemented by project types based on the
   * packaging mechanism. For example, `NodeProject` delegates this to `.npmignore`.
   *
   * @param _pattern The glob pattern to exclude
   */
  public addPackageIgnore(_pattern: string) {
    // nothing to do at the abstract level
  }

  /**
   * Adds a .gitignore pattern.
   * @param pattern The glob pattern to ignore.
   */
  public addGitIgnore(pattern: string) {
    this.gitignore.addPatterns(pattern);
  }

  /**
   * Marks the provided file(s) as being generated. This is achieved using the
   * github-linguist attributes. Generated files do not count against the
   * repository statistics and language breakdown.
   *
   * @param glob the glob pattern to match (could be a file path).
   *
   * @see https://github.com/github/linguist/blob/master/docs/overrides.md
   */
  public annotateGenerated(glob: string): void {
    this.gitattributes.addAttributes(glob, "linguist-generated");
  }
}
