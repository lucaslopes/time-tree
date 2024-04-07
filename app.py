import time
import tzlocal
import threading
import flet as ft
from datetime import datetime, timezone
from tinydb import TinyDB, Query

class TimeTree:
    def __init__(self, page: ft.Page, db_path: str = 'time_tree.json') -> None:
        self.db = TinyDB(db_path)
        self.page = page
        self.main_attributes()
        self.configure_page()
        self.main_page()
        self.update_entries_list()
        self.update_current_task(self.root_task())
    
    def root_task(self):
        return {'doc_id': 0, 'description': '\U0001F3E0'}

    def main_attributes(self):
        self.running = False
        self.start_time = None
        self.end_time = None
        self.description = None
        self.current_task = 0
        self.top_bar_title = ft.Text(value="")
        self.path = ft.Row(scroll="auto", width=self.page.window_width * .95, height=self.page.window_height * .05, controls=self.get_path_buttons())

    def configure_page(self):
        self.page.bgcolor = ft.colors.BROWN_600
        self.page.padding = 0
        self.page.window_width = 350
        self.page.window_height = 450
        self.page.window_resizable = True
        self.page.window_always_on_top = True
        self.page.title = "Time Tree"

    def update_entries_list(self):
        self.entries_list.content.controls.clear()
        entries = self.db.search(Query().parent_id == self.current_task)
        for entry in entries:
            s_time, e_time = [entry[t][2:].replace('-', '/').replace('T', ' ') for t in ['start_time', 'end_time']]
            list_tile = ft.Container(
                ft.ListTile(
                  title=ft.Text(value=f"{entry['description']}"),
                  subtitle=ft.Text(value=f"Start: {s_time}\nEnd: {e_time}\nTime elapsed: {entry['duration']}s"),
                  leading=ft.IconButton(icon=ft.icons.TASK, on_click=lambda e, entry=entry: self.update_current_task(entry, e))),
                border = ft.border.all(1, ft.colors.WHITE),
                border_radius = self.page.window_width * .025)
            self.entries_list.content.controls.append(list_tile)
        self.entries_list.update()
        self.page.update()

    def update_current_task(self, entry = None, event = None):
        entry = entry if entry else self.root_task()
        self.current_task = entry['doc_id'] if 'doc_id' in entry else entry.doc_id
        self.top_bar_title.value = self.format_duration()
        self.path.controls = self.get_path_buttons(entry)
        self.update_entries_list()
        self.page.update()

    def format_duration(self):
        return f'0{str(self.get_duration()).split(".")[0]}' if self.running else "00:00:00"

    def update_time(self):
        while self.running:
            self.end_time = self.get_local_time()
            self.top_bar_title.value = self.format_duration()
            self.page.update()
            time.sleep(1)
        self.top_bar_title.value = self.format_duration()

    def go_back(self, _):
        if self.current_task != 0:
            current_entry = self.db.get(doc_id = self.current_task)
            parent_id = current_entry['parent_id']
            parent_entry = self.db.get(doc_id = parent_id) if parent_id != 0 else None
            self.update_current_task(parent_entry)

    def on_path_click(self, event):
        clicked_word = event.control.data
        # TODO: instead of searching the db, seach on the self.path list. To do this, we need to store the entries in the path list and not only the names
        entry = None if clicked_word == '\U0001F3E0' else self.db.search(Query().description == clicked_word)[0]
        self.update_current_task(entry)

    def get_identifier(self, entry):
        return entry['description'] if len(entry['description']) > 0 else f'#{entry.doc_id}'

    def get_path(self, entry = None):
        if self.current_task == 0:
            return '\U0001F3E0'
        # Build the path from the current task to the root
        path = [self.get_identifier(entry)]
        parent_id = entry['parent_id'] if 'parent_id' in entry else 0
        while parent_id != 0:
            parent_entry = self.db.get(doc_id=parent_id)
            path.insert(0, self.get_identifier(parent_entry))
            parent_id = parent_entry.get('parent_id', 0)
        path.insert(0, '\U0001F3E0')
        return " > ".join(path)

    def get_path_buttons(self, entry = None):
        # self.path = ft.Text(value=self.get_path(), width=self.page.window_width * .95, height=self.page.window_height * .05, no_wrap=True, text_align=ft.alignment.top_center)
        return [ft.TextButton(word, data=word, on_click=self.on_path_click) for word in self.get_path(entry).split(" > ")]

    def get_local_time(self):
        return datetime.now(timezone.utc).astimezone(tzlocal.get_localzone())
    
    def get_duration(self):
        return self.end_time - self.start_time

    def add_entry(self):
        self.db.insert({
            'parent_id': self.current_task,
            'start_time': self.start_time.isoformat(timespec='seconds'), 
            'end_time': self.end_time.isoformat(timespec='seconds'), 
            'duration': round(self.get_duration().total_seconds()), 
            'description': self.description})

    def stopper(self):
        self.running = False
        self.end_time = self.get_local_time()
        self.description = self.description_input.content.value
        self.add_entry()
        self.description_input.content.value = ""
        self.description_input.visible = False
        self.entries_list.visible = True
        self.top_bar.content.controls[0].visible = True
        self.top_bar.content.controls[1].visible = True
        self.top_bar.content.controls[-1].visible = True
        self.top_bar.content.controls[-2].visible = True
        self.main_button.icon = "play_arrow"
        self.main_button.tooltip = "Start Timer"
        self.main_button.bgcolor = ft.colors.GREEN_700
        self.top_bar.bgcolor = ft.colors.BROWN_800
        self.page.bgcolor = ft.colors.BROWN_600
        self.update_entries_list()
        self.update_time()
    
    def starter(self):
        self.running = True
        self.start_time = self.get_local_time()
        self.end_time = None
        self.description_input.visible = True
        self.entries_list.visible = False
        self.top_bar.content.controls[0].visible = False
        self.top_bar.content.controls[1].visible = False
        self.top_bar.content.controls[-1].visible = False
        self.top_bar.content.controls[-2].visible = False
        self.main_button.icon = "stop"
        self.main_button.tooltip = "Stop Timer"
        self.main_button.bgcolor = ft.colors.BROWN_700
        self.top_bar.bgcolor = ft.colors.GREEN_800
        self.page.bgcolor = ft.colors.GREEN_600
        threading.Thread(target=self.update_time).start()
    
    def toggle_timer(self, _):
        self.stopper() if self.running else self.starter()
        self.page.update()
    
    def main_page(self):
        back_button = ft.IconButton(icon=ft.icons.ARROW_BACK, on_click=self.go_back, icon_color=ft.colors.WHITE)
        edit_button = ft.IconButton(icon=ft.icons.EDIT, on_click=lambda e: True, icon_color=ft.colors.WHITE)
        settings_button = ft.IconButton(icon=ft.icons.SETTINGS, on_click=lambda e: True, icon_color=ft.colors.WHITE)
        self.top_bar = ft.Container(
          content=ft.Row(controls=[back_button, self.top_bar_title, edit_button, settings_button]),  # Add back button to top bar
          bgcolor=ft.colors.BROWN_800,
          width=self.page.window_width,
          height=self.page.window_height * .1)
        self.description_input = ft.Container(
            ft.TextField(hint_text="Enter task description", expand=True, width=self.page.window_width * .95, height=self.page.window_height * .1),
            alignment=ft.alignment.center,
            visible=False)
        self.entries_list = ft.Container(
            ft.ListView(
              width=self.page.window_width * .95,
              height=self.page.window_height * .8,
              spacing=self.page.window_width * .025),
            alignment=ft.alignment.top_center,
            margin=0,
            padding=0,
          )
        self.main_button = ft.FloatingActionButton(icon="play_arrow", tooltip="Start Timer", on_click=self.toggle_timer, bgcolor=ft.colors.GREEN_700)
        self.page.add(self.main_button)
        self.page.add(self.top_bar)
        self.page.add(self.path)
        self.page.add(self.description_input)
        self.page.add(self.entries_list)
        self.update_entries_list()

ft.app(target=TimeTree)