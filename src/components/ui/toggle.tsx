interface ToggleProps {
    name: string;
    id: string;
    defaultChecked?: boolean;
    disabled?: boolean;
}

export function Toggle({ name, id, defaultChecked, disabled }: ToggleProps) {
    return (
        <label
            htmlFor={id}
            className={`inline-flex items-center ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
            <input
                type="checkbox"
                id={id}
                name={name}
                value="true"
                defaultChecked={defaultChecked}
                disabled={disabled}
                className="sr-only peer"
            />
            <div className="
                relative w-11 h-6 rounded-full
                bg-gray-600 peer-checked:bg-blue-600
                transition-colors duration-200
                after:content-[''] after:absolute after:top-0.5 after:left-0.5
                after:bg-white after:rounded-full after:w-5 after:h-5 after:shadow-sm
                after:transition-transform after:duration-200
                peer-checked:after:translate-x-5
                peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-gray-900
            " />
        </label>
    );
}
