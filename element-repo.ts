import {Repo} from 'github-cache';
import {Analyzer} from 'hydrolysis';
import * as nodegit from 'nodegit';

export interface ElementRepo {

  /**
   * A relative path like 'repos/paper-input' that's points to a
   * directory that contains a pristine checkout of the element as it
   * exists at master.
   */
  dir: string;

  /**
   * Metadata about the elements' github repo.
   */
  ghRepo: Repo;

  /**
   * The git repo to commit to.
   */
  repo: nodegit.Repository;

  /**
   * A hydrolysis Analyzer for *all* elements in the PolymerElements
   * org and their dependencies.
   */
  analyzer: Analyzer;

  /**
   * If true, commits made to the repo will be pushed.
   */
  dirty?: boolean;

  /**
   * True if the changes need human review.
   *
   * If true, all changes made to the element will go out into a PR that
   * will be assigned to you. Otherwise the changes will be pushed directly
   * to master. Has no effect if dirty is false.
   */
  needsReview?: boolean;

  pushStatus: PushStatus;
}

export enum PushStatus {
  /**
   * We haven't yet tried to push the element
   */
  unpushed,
  /**
   * We tried and succeded!
   */
  succeeded,
  /**
   * We tried and failed!
   */
  failed,
  /**
   * We tried but were denied locally. i.e. because max_changes wasn't large
   * enough and we'd already used up all of our pushes this run.
   */
  denied
}
