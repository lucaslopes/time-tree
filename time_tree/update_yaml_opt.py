import re
import json
import yaml
import math
import hashlib
import pandas as pd
import networkx as nx
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from obsidiantools import api as otools

# Conversion constants
YEAR_SEC = 31536000  # 365 days
WEEK_SEC = 604800    # 7 days
DAY_SEC = 86400
HOUR_SEC = 3600
MINUTE_SEC = 60
SECOND_SEC = 1

# Pre-compile regex pattern for JSON blocks
TIME_TRACKER_PATTERN = re.compile(r'```simple-time-tracker(.*?)```', re.DOTALL)


def compute_checksum(text: str) -> str:
    """Compute MD5 checksum of the provided text."""
    return hashlib.md5(text.encode('utf-8')).hexdigest()


def process_file(file_path: Path) -> dict:
    """
    Processes a markdown file to extract time tracker data using caching.
    If the file's checksum matches the cached one in YAML, returns the cached duration.
    Otherwise, extracts JSON blocks, sums durations, and updates the YAML with new cache values.

    Returns a dict with keys: 'name' and 'duration' (in seconds).
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        # If file cannot be read, skip processing
        return None

    # Extract all time tracker JSON blocks and compute checksum on their concatenation
    time_tracker_blocks = TIME_TRACKER_PATTERN.findall(content)
    concatenated_blocks = "".join(time_tracker_blocks)
    checksum = compute_checksum(concatenated_blocks)
    cached_duration = None
    cached_checksum = None
    # Check if YAML front matter exists
    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            try:
                meta = yaml.safe_load(parts[1]) or {}
            except Exception:
                meta = {}
            cached_checksum = meta.get('cache_checksum')
            cached_duration = meta.get('cached_duration')

    # Temporarily disable caching logic for debugging
    # if False:
    if False:
        note_name = file_path.stem
        return {"name": note_name, "duration": cached_duration}

    # Else, process the file by extracting JSON blocks
    total_duration = 0
    note_name = None
    matches = TIME_TRACKER_PATTERN.findall(content)
    for match in matches:
        json_content = match.strip()
        if not json_content:
            continue
        try:
            data = json.loads(json_content)
            # Sum duration for each entry
            if 'entries' in data:
                for entry in data['entries']:
                    start = pd.to_datetime(entry.get('startTime'))
                    end = pd.to_datetime(entry.get('endTime'))
                    if pd.isnull(start) or pd.isnull(end):
                        continue
                    total_duration += (end - start).total_seconds()
            # Extract note name if available
            if note_name is None and 'name' in data:
                raw_name = data['name']
                note_name = raw_name[2:-2]  # Remove surrounding markers
        except json.JSONDecodeError:
            continue

    if note_name is None:
        note_name = file_path.stem

    # After processing all JSON blocks, before updating YAML front matter:
    print(f"DEBUG: process_file: {file_path} note: {note_name} total_duration: {total_duration}")

    # Update YAML front matter with cache_checksum and cached_duration
    new_meta = {"cache_checksum": checksum, "cached_duration": total_duration}
    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            try:
                meta = yaml.safe_load(parts[1]) or {}
            except Exception:
                meta = {}
            meta.update(new_meta)
            new_yaml = yaml.safe_dump(meta, sort_keys=False)
            new_content = f"---\n{new_yaml}---\n{parts[2].lstrip()}"
        else:
            meta = new_meta
            new_yaml = yaml.safe_dump(meta, sort_keys=False)
            new_content = f"---\n{new_yaml}---\n{content}"
    else:
        meta = new_meta
        new_yaml = yaml.safe_dump(meta, sort_keys=False)
        new_content = f"---\n{new_yaml}---\n{content}"
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    return {"name": note_name, "duration": total_duration}


def get_time_tracking_data(directory: Path) -> pd.DataFrame:
    """
    Reads markdown files concurrently from the given directory, processes each file to
    extract time tracker JSON data, and returns a DataFrame with time tracking entries.
    """
    md_files = list(directory.rglob('*.md'))
    results = []
    with ThreadPoolExecutor() as executor:
        futures = {executor.submit(process_file, md_file): md_file for md_file in md_files}
        for future in futures:
            result = future.result()
            if result is not None:
                results.append(result)
    if not results:
        return pd.DataFrame(columns=["name", "duration"])
    df = pd.DataFrame(results)
    return df


def calculate_accumulated_duration_iterative(G: nx.Graph, target_node: str):
    """
    Calculates accumulated duration for a tree graph G starting from target_node.
    This function uses an iterative postorder traversal and processes subtrees of the
    target_node concurrently.
    """
    # Initialize each node's accumulated_duration with its own duration
    for node in G.nodes:
        G.nodes[node]['accumulated_duration'] = G.nodes[node]['duration']
        print(f"DEBUG: Initial duration for node {node}: {G.nodes[node]['duration']}")

    # Get direct children of the target_node
    children = [n for n in G.neighbors(target_node)]

    def process_subtree(sub_root, parent):
        print(f"DEBUG: Starting process_subtree for sub_root: {sub_root} with parent: {parent}")
        stack = [(sub_root, parent)]
        postorder = []
        while stack:
            node, par = stack.pop()
            print(f"DEBUG: process_subtree: Visiting node: {node} from parent: {par}")
            postorder.append((node, par))
            for neigh in G.neighbors(node):
                if neigh == par:
                    continue
                stack.append((neigh, node))
        # Process nodes in reverse order
        for node, par in reversed(postorder):
            before = G.nodes[node]['accumulated_duration']
            for neigh in G.neighbors(node):
                if neigh == par:
                    continue
                G.nodes[node]['accumulated_duration'] += G.nodes[neigh]['accumulated_duration']
                print(f"DEBUG: process_subtree: Node {node} updated: {before} + {G.nodes[neigh]['accumulated_duration']} = {G.nodes[node]['accumulated_duration']}")
        print(f"DEBUG: Finished process_subtree for sub_root: {sub_root}, accumulated_duration: {G.nodes[sub_root]['accumulated_duration']}")

    with ThreadPoolExecutor() as executor:
        futures = [executor.submit(process_subtree, child, target_node) for child in children]
        for f in futures:
            f.result()

    # Finally, update the target_node's accumulated_duration
    total = G.nodes[target_node]['duration']
    for child in children:
        total += G.nodes[child]['accumulated_duration']
    G.nodes[target_node]['accumulated_duration'] = total
    print(f"DEBUG: Target node {target_node} final accumulated_duration: {total}")


def format_elapsed_time(total_seconds: int) -> str:
    """
    Formats elapsed time (given in total seconds) into a string like:
    '2y 51w 6d 23h 59m 59s', showing only non-zero units.
    """
    remaining = total_seconds
    parts = []
    for unit, unit_sec in (('y', YEAR_SEC), ('w', WEEK_SEC), ('d', DAY_SEC),
                             ('h', HOUR_SEC), ('m', MINUTE_SEC), ('s', 1)):
        value = remaining // unit_sec
        if value > 0:
            parts.append(f"{value}{unit}")
        remaining %= unit_sec
    return " ".join(parts) if parts else "0s"


def update_yaml_metadata(file_path: Path, node_size, elapsed):
    """
    Reads the markdown file at file_path, updates (or creates) its YAML front matter 
    with 'node_size' and 'elapsed' properties, and writes the changes back.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            yaml_text = parts[1]
            rest = parts[2]
        else:
            yaml_text = parts[1]
            rest = ""
        try:
            meta = yaml.safe_load(yaml_text) or {}
        except Exception:
            meta = {}
        meta['node_size'] = node_size
        meta['elapsed'] = elapsed
        new_yaml = yaml.safe_dump(meta, sort_keys=False)
        new_content = f"---\n{new_yaml}---\n{rest.lstrip()}"
    else:
        meta = {'node_size': node_size, 'elapsed': elapsed}
        new_yaml = yaml.safe_dump(meta, sort_keys=False)
        new_content = f"---\n{new_yaml}---\n{content}"
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"DEBUG: update_yaml_metadata: Updated {file_path} with node_size: {node_size}, elapsed: {elapsed}")


def process_graph(vault, df, df_acc_time: dict, target_node='root') -> nx.Graph:
    """
    Creates a subgraph from the vault based on notes in the 'TimeTree/' folder,
    sets each node's duration (in seconds), and calculates the accumulated duration
    using an iterative approach with parallel subtree processing.
    """
    nodes_list = df[df['rel_filepath'].astype(str).str.startswith('TimeTree/')].index.tolist()
    G = vault.graph.subgraph(nodes_list).copy()
    for n in G.nodes:
        try:
            # Attempt to use the note title from the vault metadata
            note_title = df.loc[n, 'title']
        except KeyError:
            try:
                # Fallback to using the file stem if title is not present
                rel_path = df.loc[n, 'rel_filepath']
                note_title = Path(rel_path).stem
            except Exception:
                note_title = n
        duration = df_acc_time.get(note_title, 0)
        G.nodes[n]['duration'] = float(duration)
    calculate_accumulated_duration_iterative(G, target_node)
    return G


def normalize_and_update_nodes(G):
    """
    Normalizes the accumulated durations into node sizes based on the area of a circle,
    ensuring the smallest circle has a diameter of 6 and the largest (root) a diameter of 100.
    Also formats the elapsed time using the custom format.
    """
    sizes = [G.nodes[n]['accumulated_duration'] for n in G.nodes]
    if sizes:
        min_weight = min(sizes)
        max_weight = max(sizes)
    else:
        min_weight, max_weight = 0, 1

    min_d = 6
    max_d = 100
    A_min = min_d ** 2
    A_max = max_d ** 2

    for n in G.nodes:
        acc = G.nodes[n]['accumulated_duration']
        print(f"DEBUG: normalize: Node {n} has accumulated_duration: {acc}")
        if max_weight == min_weight:
            node_size = max_d
        else:
            A = A_min + (acc - min_weight) / (max_weight - min_weight) * (A_max - A_min)
            node_size = math.sqrt(A)
        node_size = round(node_size, 4)
        G.nodes[n]['node_size'] = node_size
        formatted_elapsed = format_elapsed_time(int(acc))
        print(f"DEBUG: normalize: Node {n} node_size: {node_size}, formatted_elapsed: {formatted_elapsed}")
        G.nodes[n]['elapsed'] = formatted_elapsed


def update_all_notes_parallel(G, vault_directory, df) -> list:
    """
    Updates the YAML front matter of all notes in the graph with the calculated 
    'node_size' and 'elapsed' values in parallel, and returns a list of log messages.
    """
    log_messages = []
    def update_note(n):
        try:
            rel_path = df.loc[n, 'rel_filepath']
        except KeyError:
            msg = f"DEBUG: update_note: Note {n} not found in metadata."
            print(msg)
            return msg
        file_path = vault_directory / rel_path
        node_size = G.nodes[n]['node_size']
        elapsed = G.nodes[n]['elapsed']
        update_yaml_metadata(file_path, node_size, elapsed)
        msg = f"DEBUG: update_note: Updated {file_path} with node_size: {node_size:.4f}, elapsed: {elapsed}"
        print(msg)
        return msg
    with ThreadPoolExecutor() as executor:
        results = list(executor.map(update_note, list(G.nodes)))
        log_messages.extend(results)
    return log_messages


def write_log(log_messages: list, log_file: Path):
    """
    Writes the log messages into the provided log_file in Markdown format.
    Overwrites any existing content.
    """
    with open(log_file, 'w', encoding='utf-8') as f:
        f.write("\n".join(log_messages))


def main():
    # Adjust these paths to your vault and journal directories.
    VAULT_DIRECTORY = Path('/Users/lucas/Documents/TimeTree')
    JOURNAL_DIRECTORY = VAULT_DIRECTORY / 'Journal'
    logs_dir = VAULT_DIRECTORY / 'Logs'
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_file = logs_dir / 'log.md'

    vault = otools.Vault(VAULT_DIRECTORY).connect().gather()
    df = vault.get_note_metadata()

    # Get time tracking data concurrently with caching and incremental updates
    time_tracker_df = get_time_tracking_data(JOURNAL_DIRECTORY)

    # Sum up durations for each note and convert to seconds
    df_acc_time = time_tracker_df.groupby('name')['duration'].sum().reset_index()
    df_acc_time = df_acc_time.set_index('name')['duration'].to_dict()

    G = process_graph(vault, df, df_acc_time, target_node='root')
    normalize_and_update_nodes(G)
    log_messages = update_all_notes_parallel(G, VAULT_DIRECTORY, df)
    write_log(log_messages, log_file)


if __name__ == "__main__":
    main()