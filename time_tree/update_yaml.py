import re
import json
import yaml
import pandas as pd
import networkx as nx
import datetime
import math
from pathlib import Path
from obsidiantools import api as otools

# Conversion constants
YEAR_SEC = 31536000  # 365 days
WEEK_SEC = 604800    # 7 days
DAY_SEC = 86400
HOUR_SEC = 3600
MINUTE_SEC = 60
SECOND_SEC = 1


def get_time_tracking_data(directory) -> pd.DataFrame:
    """
    Reads markdown files from the given directory and extracts time tracker JSON data 
    embedded in triple-backtick code blocks with the language marker 'simple-time-tracker'.
    Returns a DataFrame with time tracking entries.
    """
    md_files = list(directory.rglob('*.md'))
    time_tracker_dfs = []
    for md_file in md_files:
        with open(md_file, 'r', encoding='utf-8') as file:
            content = file.read()
            pattern = re.compile(r'```simple-time-tracker(.*?)```', re.DOTALL)
            matches = pattern.findall(content)
            for match in matches:
                json_content = match.strip()
                try:
                    data = json.loads(json_content)
                    df_entries = pd.DataFrame(data['entries'])
                    time_tracker_dfs.append(df_entries)
                except json.JSONDecodeError as e:
                    # If json_content is empty, it's not an error—simply skip this block.
                    if not json_content:
                        continue
                    print(f"Error decoding JSON in file {md_file}: {e}")
    time_tracker_df = pd.concat(time_tracker_dfs)
    # Remove surrounding markers from note names if present
    time_tracker_df['name'] = time_tracker_df['name'].str[2:-2]
    time_tracker_df['startTime'] = pd.to_datetime(time_tracker_df['startTime'])
    time_tracker_df['endTime'] = pd.to_datetime(time_tracker_df['endTime'])
    time_tracker_df['duration'] = time_tracker_df['endTime'] - time_tracker_df['startTime']
    return time_tracker_df


def calculate_accumulated_duration(G, target_node):
    """
    Propagates duration values from the leaves up to the target_node using an iterative postorder traversal.
    Each node's 'accumulated_duration' is initialized to its own duration (in seconds) and then
    the accumulated durations of its children are added.
    """
    # Initialize each node's accumulated_duration with its own duration
    for node in G.nodes:
        G.nodes[node]['accumulated_duration'] = G.nodes[node]['duration']
    
    # Iterative postorder traversal
    stack = [(target_node, None)]
    postorder = []
    while stack:
        node, parent = stack.pop()
        postorder.append((node, parent))
        for neighbor in G.neighbors(node):
            if neighbor != parent:
                stack.append((neighbor, node))
    
    # Process nodes in reverse order (postorder)
    for node, parent in reversed(postorder):
        if parent is not None:
            G.nodes[parent]['accumulated_duration'] += G.nodes[node]['accumulated_duration']


def update_yaml_metadata(file_path: Path, node_size, elapsed):
    """
    Reads the markdown file at file_path, updates (or creates) its YAML front matter 
    with 'node_size' and 'elapsed' properties, and writes the changes back.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check for YAML front matter (expected to be between the first two '---' lines)
    if content.startswith('---'):
        parts = content.split('---', 2)
        # parts[0] is empty (before first ---), parts[1] is YAML, parts[2] is the rest
        if len(parts) >= 3:
            yaml_text = parts[1]
            rest = parts[2]
        else:
            yaml_text = parts[1]
            rest = ""
        try:
            meta = yaml.safe_load(yaml_text) or {}
        except Exception as e:
            print(f"YAML parse error in {file_path}: {e}")
            meta = {}
        meta['node_size'] = node_size
        meta['elapsed'] = elapsed
        new_yaml = yaml.safe_dump(meta, sort_keys=False)
        new_content = f"---\n{new_yaml}---\n{rest.lstrip()}"
    else:
        # If no YAML front matter exists, add one.
        meta = {'node_size': node_size, 'elapsed': elapsed}
        new_yaml = yaml.safe_dump(meta, sort_keys=False)
        new_content = f"---\n{new_yaml}---\n{content}"
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)


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


def main():
    # Adjust these paths to your vault and journal directories
    VAULT_DIRECTORY = Path('/Users/lucas/Documents/TimeTree')
    JOURNAL_DIRECTORY = VAULT_DIRECTORY / 'Journal'
    
    vault = otools.Vault(VAULT_DIRECTORY).connect().gather()
    df = vault.get_note_metadata()
    time_tracker_df = get_time_tracking_data(JOURNAL_DIRECTORY)
    
    # Sum up the durations for each note (the 'name' field should correspond to note identifiers)
    df_acc_time = time_tracker_df.groupby('name')['duration'].sum().reset_index()
    # Convert durations to total seconds
    df_acc_time = df_acc_time.set_index('name')['duration'].to_dict()
    
    # Only update notes that are in the 'TimeTree/' folder
    nodes_list = df[df['rel_filepath'].astype(str).str.startswith('TimeTree/')].index.tolist()
    
    # Create a subgraph from the vault's graph using the selected nodes
    G = vault.graph.subgraph(nodes_list).copy()
    for n in G.nodes:
        duration = df_acc_time.get(n, pd.Timedelta(0))
        G.nodes[n]['duration'] = duration.total_seconds()
    
    # Propagate durations from the leaves to the root (assumes 'root' exists as the root node)
    calculate_accumulated_duration(G, 'root')
    
    # Normalize node sizes based on a circle's area.
    # The area A is proportional to the square of the diameter.
    # We want: at acc = min_weight -> diameter = 6, and at acc = max_weight -> diameter = 100.
    # Thus, compute A_min = 6^2 and A_max = 100^2, then:
    # A = A_min + (acc - min_weight) / (max_weight - min_weight) * (A_max - A_min)
    # node_size (diameter) = sqrt(A)
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
        if max_weight == min_weight:
            node_size = max_d
        else:
            # Normalize area based on accumulated duration
            A = A_min + (acc - min_weight) / (max_weight - min_weight) * (A_max - A_min)
            node_size = math.sqrt(A)
        G.nodes[n]['node_size'] = node_size
        # Format elapsed time as HH:MM:SS (convert seconds to an int for clarity)
        elapsed_str = format_elapsed_time(int(acc))
        G.nodes[n]['elapsed'] = elapsed_str
    
    # Update YAML front matter for each note with the calculated properties
    for n in G.nodes:
        try:
            rel_path = df.loc[n, 'rel_filepath']
        except KeyError:
            print(f"Note {n} not found in metadata.")
            continue
        file_path = VAULT_DIRECTORY / rel_path
        node_size = G.nodes[n]['node_size']
        elapsed = G.nodes[n]['elapsed']
        update_yaml_metadata(file_path, node_size, elapsed)
        print(f"Updated {file_path} with node_size: {node_size:.2f}, elapsed: {elapsed}")


if __name__ == "__main__":
    main()